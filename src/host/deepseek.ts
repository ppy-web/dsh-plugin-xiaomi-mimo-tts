import WebSocket from 'ws'
import { DEEPSEEK_TTS_ENDPOINT } from '../constants.js'
import { DEEPSEEK_INPUT_IDLE_MS, DEEPSEEK_TEXT_BYTES, DEEPSEEK_TEXT_UNITS, deepseekTextSize } from '../text/deepseek-limit.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { PcmQueue } from './pcm-queue.js'
import { abortable } from './abortable.js'
import { TtsProviderError } from './provider-error.js'

export interface DeepseekSessionOptions {
  settings: ResolvedTtsSettings
  signal: AbortSignal
  onAudio: (bytes: Buffer) => void
  connect?: (headers: Record<string, string>, endpoint: string) => WebSocket
}

export class DeepseekSession {
  private readonly opened = Promise.withResolvers<void>()
  private readonly completed = Promise.withResolvers<void>()
  readonly ready = this.opened.promise
  readonly done = this.completed.promise
  private readonly socket: WebSocket
  private timer: ReturnType<typeof setTimeout> | undefined
  private age: ReturnType<typeof setTimeout> | undefined
  private settled = false
  private finishing = false
  private length = 0
  private units = 0
  private bytes = 0
  private audioBytes = 0
  private tail = Buffer.alloc(0)

  constructor(private readonly options: DeepseekSessionOptions) {
    const { settings, signal } = options
    signal.throwIfAborted()
    void this.ready.catch(() => {})
    void this.done.catch(() => {})
    const endpoint = new URL(DEEPSEEK_TTS_ENDPOINT)
    endpoint.search = new URLSearchParams({ voice_id: settings.deepseekVoice, format: 'pcm', filter_markdown: 'false' }).toString()
    const headers = { Authorization: `Bearer ${settings.deepseekApiKey.trim()}` }
    const handshakeTimeout = Math.min(settings.requestTimeoutMs, 10_000)
    this.socket = options.connect?.(headers, endpoint.href) ?? new WebSocket(endpoint, {
      headers, handshakeTimeout, followRedirects: false, perMessageDeflate: false, maxPayload: settings.maxPausedPcmBytes,
    })
    this.socket.on('open', () => {
      if (this.settled) return
      this.opened.resolve()
      this.arm(Math.min(DEEPSEEK_INPUT_IDLE_MS + 5_000, settings.requestTimeoutMs))
      this.age = setTimeout(() => this.finishWith(new TtsProviderError('tts-timeout', undefined, 504)), 30 * 60_000)
    })
    this.socket.on('unexpected-response', (_request, response) => {
      response.resume()
      const status = response.statusCode ?? 502
      const code = status === 401 || status === 403 ? 'api-key-rejected' : status === 429 ? 'rate-limited'
        : status === 402 ? 'resource-unavailable' : status === 504 ? 'tts-timeout' : 'deepseek-request-failed'
      this.finishWith(new TtsProviderError(code, undefined, status >= 400 && status <= 599 ? status : 502))
    })
    this.socket.on('message', this.receive)
    this.socket.on('error', () => this.finishWith(new TtsProviderError('deepseek-request-failed')))
    this.socket.on('close', () => this.finishWith(new TtsProviderError('stream-incomplete')))
    signal.addEventListener('abort', this.abort, { once: true })
    this.arm(handshakeTimeout)
    if (signal.aborted) this.abort()
  }

  append(text: string): void {
    if (!text.trim()) return
    if (this.finishing || this.settled || this.socket.readyState !== WebSocket.OPEN) throw new TtsProviderError('invalid-session-state')
    const size = deepseekTextSize(text)
    this.length += size.length
    this.units += size.units
    this.bytes += size.bytes
    if (this.length > this.options.settings.maxTextLength || this.units > DEEPSEEK_TEXT_UNITS || this.bytes > DEEPSEEK_TEXT_BYTES) {
      const error = new TtsProviderError('text-too-long', undefined, 413)
      this.finishWith(error)
      throw error
    }
    this.send({ event: 'text', text })
    this.arm(Math.min(DEEPSEEK_INPUT_IDLE_MS + 5_000, this.options.settings.requestTimeoutMs))
  }

  finish(): Promise<void> {
    if (this.finishing || this.settled) return this.done
    if (!this.length) this.finishWith(new TtsProviderError('text-required', undefined, 400))
    else {
      this.finishing = true
      this.send({ event: 'finish_text' })
      this.arm(this.options.settings.requestTimeoutMs)
    }
    return this.done
  }

  private send(value: object): void {
    this.socket.send(JSON.stringify(value), error => {
      if (error) this.finishWith(new TtsProviderError('deepseek-request-failed'))
    })
  }

  private receive = (data: WebSocket.RawData, binary: boolean): void => {
    if (this.settled) return
    try {
      const raw = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
      if (!binary) {
        const result = JSON.parse(raw.toString()) as { event?: unknown; code?: unknown }
        if (result?.event !== 'finish') throw new TtsProviderError('invalid-stream-response')
        if (result.code !== 'success') {
          if (result.code === 'input_timeout') throw new TtsProviderError('tts-timeout', undefined, 504)
          if (result.code === 'content_filter') throw new TtsProviderError('content-filtered', undefined, 400)
          if (result.code === 'invalid_input') throw new TtsProviderError('invalid-request', undefined, 400)
          throw new TtsProviderError('deepseek-request-failed')
        }
        if (!this.finishing || !this.audioBytes || this.tail.length) throw new TtsProviderError('stream-incomplete')
        this.finishWith()
        return
      }
      if (!this.length) throw new TtsProviderError('invalid-stream-response')
      if (this.finishing) this.arm(this.options.settings.requestTimeoutMs)
      this.audioBytes += raw.length
      if (this.audioBytes + 44 > this.options.settings.maxWavAudioBytes) throw new TtsProviderError('audio-too-large')
      const bytes = this.tail.length ? Buffer.concat([this.tail, raw]) : raw
      const end = bytes.length - bytes.length % 2
      this.tail = Buffer.from(bytes.subarray(end))
      if (end) this.options.onAudio(bytes.subarray(0, end))
    } catch (error) {
      this.finishWith(error instanceof TtsProviderError ? error : new TtsProviderError('invalid-stream-response'))
    }
  }

  private arm(ms: number): void {
    clearTimeout(this.timer)
    if (!this.settled) this.timer = setTimeout(() => this.finishWith(new TtsProviderError('tts-timeout', undefined, 504)), ms)
  }

  private abort = (): void => this.finishWith(this.options.signal.reason ?? new TtsProviderError('tts-canceled'))

  private finishWith(error?: unknown): void {
    if (this.settled) return
    this.settled = true
    clearTimeout(this.timer)
    clearTimeout(this.age)
    this.options.signal.removeEventListener('abort', this.abort)
    this.socket.off('message', this.receive)
    this.tail = Buffer.alloc(0)
    if (error !== undefined) {
      this.opened.reject(error)
      this.completed.reject(error)
      this.socket.terminate()
    } else {
      const closeTimer = setTimeout(() => this.socket.terminate(), 1000)
      closeTimer.unref()
      this.socket.once('close', () => clearTimeout(closeTimer))
      this.socket.close()
      this.completed.resolve()
    }
  }
}

export async function streamDeepseek(text: string, settings: ResolvedTtsSettings, signal: AbortSignal,
  consume: (bytes: Uint8Array) => void | Promise<void>, connect?: DeepseekSessionOptions['connect']): Promise<void> {
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  const queue = new PcmQueue(settings.maxPausedPcmBytes, combined)
  const session = new DeepseekSession({ settings, signal: combined, onAudio: bytes => queue.push(bytes), ...(connect ? { connect } : {}) })
  const task = (async () => {
    await session.ready
    session.append(text)
    await session.finish()
  })()
  void task.then(() => queue.end(), error => queue.end(error))
  try {
    for await (const chunk of queue) await abortable(Promise.resolve(consume(chunk)), combined)
    await task
  } finally {
    controller.abort()
    await task.catch(() => {})
  }
}
