import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { DOUBAO_AGENT_PLAN_TTS_ENDPOINT, DOUBAO_TTS_ENDPOINT } from '../constants.js'
import { ttsSelection, ttsApiKey } from '../types/providers.js'
import { normalizeVoiceRate } from '../utils/encoding.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { DoubaoEvent as E, decodeDoubaoFrame, encodeDoubaoFrame } from './doubao-protocol.js'
import { TtsProviderError } from './provider-error.js'

type State = 'connecting' | 'connection' | 'starting' | 'ready' | 'finishing' | 'closing' | 'done' | 'failed'

export interface DoubaoSessionOptions {
  settings: ResolvedTtsSettings
  signal: AbortSignal
  format?: 'pcm' | 'mp3'
  onAudio: (bytes: Buffer) => void
  /** Inject a socket factory for local protocol integration tests. Never accepted from HTTP. */
  connect?: (headers: Record<string, string>, endpoint: string) => WebSocket
}

export class DoubaoSession {
  readonly ready: Promise<void>
  readonly done: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private resolveDone!: () => void
  private rejectDone!: (error: Error) => void
  private state: State = 'connecting'
  private socket: WebSocket
  private readonly sessionId = randomUUID()
  private readonly connectId = randomUUID()
  private timer: ReturnType<typeof setTimeout> | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  private textLength = 0
  private audioBytes = 0
  private pcmTail: Buffer | null = null
  private readonly requestParams

  constructor(private readonly options: DoubaoSessionOptions) {
    this.options = { ...options, settings: { ...options.settings } }
    const { settings } = this.options
    const selection = ttsSelection(settings)
    // Follow the official base_request example: StartSession and every TaskRequest
    // carry the same voice, audio and instruction parameters for this session.
    this.requestParams = {
      speaker: selection.voice,
      ...(selection.model === 'seed-icl-2.0' ? { model: 'seed-tts-2.0-standard' } : {}),
      ...(selection.provider === 'doubao' && selection.model === 'seed-tts-2.0' && selection.speechInstruction ? { additions: JSON.stringify({ context_texts: [selection.speechInstruction] }) } : {}),
      audio_params: { format: this.options.format ?? 'pcm', sample_rate: 24000, speech_rate: Math.round((normalizeVoiceRate(settings.voiceRate) - 1) * 100) },
    }
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
    this.done = new Promise((resolve, reject) => { this.resolveDone = resolve; this.rejectDone = reject })
    // Consumers may be awaiting ready before they attach to done.
    void this.ready.catch(() => {})
    void this.done.catch(() => {})
    const headers = {
      'X-Api-Key': ttsApiKey(settings),
      'X-Api-Resource-Id': settings.doubaoModel,
      'X-Api-Connect-Id': this.connectId,
    }
    const connect = (endpoint: string): WebSocket => {
      const socket = options.connect?.(headers, endpoint) ?? new WebSocket(endpoint, { headers, maxPayload: 16 * 1024 * 1024, handshakeTimeout: Math.min(10000, settings.requestTimeoutMs), followRedirects: false })
      socket.on('open', this.onOpen)
      socket.on('message', this.onMessage)
      socket.on('error', this.onError)
      socket.on('unexpected-response', (_request, response) => {
        response.resume()
        const status = response.statusCode ?? 502
        // Only retry a rejected handshake: no text or audio has been sent yet.
        if (endpoint === DOUBAO_TTS_ENDPOINT && (status === 401 || status === 403) && this.state === 'connecting') {
          socket.removeAllListeners()
          socket.on('error', () => {})
          socket.terminate()
          this.socket = connect(DOUBAO_AGENT_PLAN_TTS_ENDPOINT)
          this.arm(Math.min(10000, settings.requestTimeoutMs))
          return
        }
        this.fail(new TtsProviderError(status === 401 || status === 403 ? 'api-key-rejected' : status === 429 ? 'rate-limited' : 'doubao-handshake-failed', `Doubao handshake failed (HTTP ${status}).`, status, String(status), this.connectId))
      })
      socket.on('close', this.onClose)
      return socket
    }
    this.socket = connect(headers['X-Api-Key'].startsWith('ark-') ? DOUBAO_AGENT_PLAN_TTS_ENDPOINT : DOUBAO_TTS_ENDPOINT)
    options.signal.addEventListener('abort', this.onAbort, { once: true })
    this.arm(Math.min(10000, settings.requestTimeoutMs))
    if (options.signal.aborted) this.onAbort()
  }

  append(text: string): void {
    if (this.state !== 'ready') throw new TtsProviderError('invalid-session-state', 'Session is not accepting text.', 400)
    if (!text.trim()) return
    this.textLength += text.length
    if (this.textLength > this.options.settings.maxTextLength) {
      const error = new TtsProviderError('text-too-long', 'Text exceeds the configured message limit.', 413)
      this.fail(error)
      throw error
    }
    this.send(E.TaskRequest, { user: { uid: 'dsh-tts' }, event: E.TaskRequest, namespace: 'BidirectionalTTS', req_params: { ...this.requestParams, text } })
    this.arm()
  }

  finish(): Promise<void> {
    if (this.state !== 'ready' || this.textLength === 0) {
      this.fail(new TtsProviderError(this.textLength === 0 ? 'text-required' : 'invalid-session-state', 'No pending synthesis session.', 400))
      return this.done
    }
    this.state = 'finishing'
    this.send(E.FinishSession)
    this.arm()
    return this.done
  }

  cancel(): void { this.fail(new TtsProviderError('tts-canceled', 'Synthesis canceled.', 499)) }

  private onOpen = (): void => {
    if (this.state !== 'connecting') return
    this.state = 'connection'
    this.send(E.StartConnection)
  }

  private onMessage = (data: WebSocket.RawData, isBinary: boolean): void => {
    if (this.state === 'failed' || this.state === 'done') return
    try {
      if (!isBinary) throw new TtsProviderError('doubao-invalid-frame')
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
      const frame = decodeDoubaoFrame(bytes)
      if (frame.event >= 100 && frame.sessionId !== this.sessionId) throw new TtsProviderError('doubao-session-mismatch')
      let detail: { message?: string; status_code?: number; code?: number } = {}
      if (frame.type !== 11) {
        try { detail = JSON.parse(frame.payload.toString()) } catch { /* error packets may carry plain text */ }
      }
      const status = detail.status_code ?? detail.code
      if (frame.errorCode !== undefined || frame.event === E.ConnectionFailed || frame.event === E.SessionFailed || (status !== undefined && status !== 0 && status !== 20000000)) {
        const code = String(frame.errorCode ?? detail.status_code ?? detail.code ?? frame.event)
        const message = typeof detail.message === 'string' ? detail.message : 'Doubao rejected the synthesis request.'
        const kind = /resource|not.*open|资源|未开通/iu.test(message) ? 'resource-unavailable'
          : /auth|token|api.?key|permission|鉴权|密钥|认证|未授权/iu.test(message) ? 'api-key-rejected'
            : /speaker|voice|音色|发音人/iu.test(message) ? 'voice-unavailable'
              : /limit|quota|concurr|too many|限流|并发|配额|频率/iu.test(message) ? 'rate-limited' : 'doubao-api-error'
        throw new TtsProviderError(kind, message, kind === 'api-key-rejected' ? 403 : kind === 'rate-limited' ? 429 : 502, code, this.connectId)
      }
      if (frame.event === E.ConnectionStarted && this.state === 'connection') {
        this.state = 'starting'
        this.send(E.StartSession, {
          user: { uid: 'dsh-tts' }, event: E.StartSession, namespace: 'BidirectionalTTS',
          req_params: this.requestParams,
        })
      } else if (frame.event === E.SessionStarted && this.state === 'starting') {
        this.state = 'ready'
        this.arm()
        this.resolveReady()
      } else if (frame.event === E.TTSResponse && frame.type === 11 && (this.state === 'ready' || this.state === 'finishing')) {
        if (frame.payload.length === 0) return
        this.audioBytes += frame.payload.length
        let audio = frame.payload
        if ((this.options.format ?? 'pcm') === 'pcm') {
          if (this.pcmTail !== null) { audio = Buffer.concat([this.pcmTail, audio]); this.pcmTail = null }
          if (audio.length % 2) { this.pcmTail = Buffer.from([audio[audio.length - 1]!]); audio = audio.subarray(0, audio.length - 1) }
        }
        if (audio.length) this.options.onAudio(audio)
        this.arm()
      } else if (frame.event === E.SessionFinished && this.state === 'finishing') {
        if (this.pcmTail !== null) throw new TtsProviderError('invalid-pcm-sample')
        if (this.audioBytes === 0) throw new TtsProviderError('stream-audio-empty')
        this.state = 'closing'
        this.send(E.FinishConnection)
        this.arm(Math.min(10000, this.options.settings.requestTimeoutMs))
      } else if (frame.event === E.ConnectionFinished && this.state === 'closing') {
        this.state = 'done'
        this.cleanup()
        this.resolveDone()
        this.closeSocket()
      } else if (!new Set<number>([E.TTSSentenceStart, E.TTSSentenceEnd, E.TTSSubtitle, 154]).has(frame.event)) {
        throw new TtsProviderError('doubao-unexpected-event', `Unexpected Doubao event ${frame.event}.`)
      }
    } catch (error) { this.fail(error instanceof TtsProviderError ? error : new TtsProviderError('doubao-invalid-frame')) }
  }

  private send(event: number, payload: unknown = {}): void {
    this.socket.send(encodeDoubaoFrame(event, payload, this.sessionId), error => {
      if (error) this.fail(new TtsProviderError('doubao-request-failed'))
    })
  }

  private arm(ms = this.options.settings.requestTimeoutMs): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fail(new TtsProviderError('tts-timeout', 'Doubao synthesis timed out.', 504, undefined, this.connectId)), ms)
  }

  private onAbort = (): void => { this.cancel() }
  private onError = (): void => { this.fail(new TtsProviderError('doubao-request-failed', 'Doubao connection failed.', 502, undefined, this.connectId)) }
  private onClose = (): void => {
    clearTimeout(this.closeTimer)
    if (this.state !== 'done' && this.state !== 'failed') this.fail(new TtsProviderError('doubao-connection-closed', 'Doubao closed before synthesis completed.', 502, undefined, this.connectId))
    this.cleanup()
  }

  private cleanup(): void {
    clearTimeout(this.timer)
    this.options.signal.removeEventListener('abort', this.onAbort)
  }

  private closeSocket(): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close()
    if (this.socket.readyState !== WebSocket.CLOSED) this.closeTimer = setTimeout(() => this.socket.terminate(), 1000)
  }

  private fail(error: Error): void {
    if (this.state === 'done' || this.state === 'failed') return
    const canCancel = this.state === 'ready' && this.socket.readyState === WebSocket.OPEN
    this.state = 'failed'
    this.cleanup()
    if (canCancel) this.send(E.CancelSession)
    this.rejectReady(error)
    this.rejectDone(error)
    if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate()
    else this.closeSocket()
  }
}

export async function synthesizeDoubao(text: string, options: DoubaoSessionOptions): Promise<void> {
  const session = new DoubaoSession(options)
  try {
    await session.ready
    session.append(text)
    await session.finish()
  } finally { session.cancel() }
}

export function wrapPcmWav(pcm: Buffer): Buffer {
  if (pcm.length % 2) throw new TtsProviderError('invalid-audio-format')
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(24000, 24)
  header.writeUInt32LE(48000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
