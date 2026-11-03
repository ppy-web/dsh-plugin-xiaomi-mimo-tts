import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { validateWave } from '@deepseek-ai/dsh-experimental-speech-to-text/wave'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { Socket } from 'node:net'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket, WebSocketServer } from 'ws'
import type { SpeechAudio, SpeechDeliveryAdapter, SpeechSynthesisService } from '../host-api.js'
import { SessionSpeech } from '../host/session-speech.js'
import { prepareTtsText } from '../shared.js'
import { playbackPcm, PcmUtterances } from './audio.js'
import type { CaptureOptions } from './audio.js'

export interface PassportOptions extends CaptureOptions {
  host: string
  port: number
  accessToken: string
  deviceId: string
  maxReplySeconds: number
  requestTimeoutMs: number
}

export interface PassportSessionPort {
  readonly agent: Agent | undefined
  acquire(): Promise<AgentHandle>
  submit(text: string): void
  cancel(): void
}

interface Playback {
  id: string
  doneSent: boolean
  resolve(): void
  reject(error: Error): void
}

type Event = Record<string, unknown> & { type: string }
const MAX_FRAME_BYTES = 64 * 1024

/** Qwen Voice Bean's device-facing GCP 7 audio subset, backed entirely by DSH services. */
export class PassportBridge {
  private readonly sockets = new Set<WebSocket>()
  private readonly connections = new Set<PassportConnection>()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false })
  private current: PassportConnection | undefined
  private server: Server | undefined
  private closing: Promise<void> | undefined
  private disposed = false

  constructor(
    readonly options: PassportOptions,
    readonly session: PassportSessionPort,
    readonly recognition: Pick<SpeechToText, 'snapshot' | 'resolve' | 'transcribe'>,
    readonly synthesis: SpeechSynthesisService,
    readonly report: (code: string) => void = () => {},
    readonly delivered: (agent: Agent) => void = () => {},
  ) {}

  readonly adapter: SpeechDeliveryAdapter = {
    id: 'passport', format: 'wav',
    check: ({ agent, signal }) => { signal.throwIfAborted(); this.connectionFor(agent) },
    send: async (audio, { agent, signal }) => {
      const connection = this.connectionFor(agent)
      await connection.play(audio, signal)
      return { adapter: 'passport', target: connection.deviceId }
    },
  }

  private connectionFor(agent: Agent): PassportConnection {
    if (!this.current?.available || agent !== this.session.agent || !this.current.busy) throw new Error('passport-device-unavailable')
    return this.current
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise)
    void promise.then(() => this.pending.delete(promise), () => this.pending.delete(promise))
    return promise
  }

  checkRecognition(): void {
    const snapshot = this.recognition.snapshot()
    const provider = snapshot.providers.find(item => item.id === snapshot.selection.providerId)
    if (!provider || !['ready', 'standby'].includes(provider.preparation.phase)) throw new Error('passport-asr-unavailable')
  }

  claim(connection: PassportConnection): boolean {
    if (this.disposed) return false
    if (this.current && this.current !== connection) {
      if (this.current.deviceId !== connection.deviceId) return false
      this.current.close(4001, 'replaced')
    }
    this.current = connection
    return true
  }

  release(connection: PassportConnection): void {
    this.connections.delete(connection)
    if (this.current === connection) this.current = undefined
  }

  observe(session: Session, event: SessionEvent): void {
    if (session === this.session.agent?.session) this.current?.observe(event)
  }

  private authorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.options.accessToken}`), supplied = Buffer.from(header ?? '')
    return expected.length === supplied.length && timingSafeEqual(expected, supplied)
  }

  async listen(): Promise<void> {
    if (this.disposed || this.server) throw new Error('passport-server-unavailable')
    if (this.options.accessToken.length < 24 || /[\r\n]/u.test(this.options.accessToken)) throw new Error('passport-token-required')
    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'no-store')
      if (req.headers.origin || !this.authorized(req.headers.authorization)) { res.writeHead(401); res.end(); return }
      if (req.method !== 'GET' || req.url !== '/api/health') { res.writeHead(404); res.end(); return }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, adapter: 'passport', protocol_version: '7.0.0' }))
    })
    this.server = server
    server.on('connection', socket => { socket.setTimeout(15000, () => socket.destroy()) })
    server.on('upgrade', (req, socket, head) => {
      if (this.disposed || req.url !== '/api/realtime' || req.headers.origin || !this.authorized(req.headers.authorization)) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return
      }
      if (this.sockets.size >= 2) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return }
      this.wss.handleUpgrade(req, socket, head, ws => {
        if (socket instanceof Socket) socket.setTimeout(0)
        this.sockets.add(ws)
        ws.once('close', () => this.sockets.delete(ws))
        const connection = new PassportConnection(this, ws)
        this.connections.add(connection)
      })
    })
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => { server.off('listening', ready); reject(error) }
      const ready = () => { server.off('error', failed); resolve() }
      server.once('error', failed); server.once('listening', ready)
      server.listen(this.options.port, this.options.host)
    })
    server.on('error', () => this.report('passport-server-error'))
  }

  get address() { return this.server?.address() }

  dispose(): Promise<void> { return this.closing ??= this.shutdown() }

  private async shutdown(): Promise<void> {
    this.disposed = true
    for (const connection of [...this.connections]) connection.close(1001, 'shutdown')
    for (const socket of this.sockets) socket.terminate()
    this.wss.close()
    await new Promise<void>(resolve => {
      if (!this.server?.listening) { resolve(); return }
      this.server.close(() => resolve())
      this.server.closeAllConnections()
    })
    await Promise.allSettled(this.pending)
  }
}

class PassportConnection {
  deviceId = ''
  available = false
  busy = false
  private disposed = false
  private hello = false
  private muted = true
  private readonly capture: PcmUtterances
  private readonly speech: SessionSpeech
  private cycle = new AbortController()
  private timeout: ReturnType<typeof setTimeout> | undefined
  private readonly handshake: ReturnType<typeof setTimeout>
  private readonly heartbeat: ReturnType<typeof setInterval>
  private alive = true
  private playback: Playback | undefined
  private submitted = false
  private turn: number | undefined
  private lastSeq = -1
  private hasReply = false
  private inputWindow = Date.now()
  private inputBytes = 0

  constructor(private readonly bridge: PassportBridge, private readonly ws: WebSocket) {
    this.capture = new PcmUtterances(bridge.options)
    this.speech = new SessionSpeech(bridge.synthesis, { load: async (_id, fallback) => fallback, save: async () => {} },
      { delivery: 'passport', defaultMode: 'auto', maxAutoCharacters: 0, maxDurationMs: bridge.options.maxReplySeconds * 1000 },
      agent => { bridge.delivered(agent); this.finish() },
      () => this.fail('passport-speech-failed'))
    this.handshake = setTimeout(() => this.close(1008, 'handshake-timeout'), 10000)
    this.heartbeat = setInterval(() => {
      if (!this.alive) { this.close(1001, 'heartbeat-timeout'); this.ws.terminate(); return }
      this.alive = false
      if (this.ws.readyState === WebSocket.OPEN) this.ws.ping()
    }, 30000)
    this.handshake.unref(); this.heartbeat.unref()
    ws.on('pong', () => { this.alive = true })
    ws.on('message', (data, binary) => {
      if (this.disposed) return
      this.alive = true
      try {
        if (binary) throw new Error('passport-invalid-event')
        const value: unknown = JSON.parse(data.toString())
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Event).type !== 'string') throw new Error('passport-invalid-event')
        this.receive(value as Event)
      } catch { this.fail('passport-invalid-event'); this.close(1008, 'invalid-event') }
    })
    ws.on('error', () => this.close(1011, 'transport-error'))
    ws.on('close', () => this.close())
  }

  private send(type: string, fields: Record<string, unknown> = {}): void {
    if (this.disposed || this.ws.readyState !== WebSocket.OPEN) throw new Error('passport-disconnected')
    if (this.ws.bufferedAmount > 128 * 1024) throw new Error('passport-output-overflow')
    this.ws.send(JSON.stringify({ type, event_id: randomUUID(), ...fields }))
  }

  private receive(event: Event): void {
    if (event.type === 'session.hello') {
      if (this.hello) throw new Error('passport-duplicate-hello')
      this.hello = true
      void this.bridge.track(this.negotiate(event)).catch(error => {
        if (!this.disposed) {
          const code = error instanceof Error && ['passport-asr-unavailable', 'passport-protocol-mismatch',
            'passport-preset-unavailable', 'passport-preset-changed'].includes(error.message) ? error.message : 'passport-session-unavailable'
          this.fail(code); this.close(1013, 'service-unavailable')
        }
      })
      return
    }
    if (!this.available) return
    if (event.type === 'session.ping') { this.send('session.pong', { request_event_id: event.event_id }); return }
    if (event.type === 'wake') { this.send('voice.state', { state: this.busy ? 'processing' : 'listening' }); return }
    if (event.type === 'input.mute') { this.muted = true; this.capture.reset(); return }
    if (event.type === 'input.unmute') { this.muted = false; this.capture.reset(); return }
    if (event.type === 'response.cancel') { this.interrupt(); return }
    if (event.type.startsWith('playback.')) {
      if (event.responseId !== this.playback?.id) return
      if (event.type === 'playback.ended' && this.playback?.doneSent) this.playback.resolve()
      if (event.type === 'playback.cancelled') this.interrupt()
      return
    }
    if (this.muted || this.busy) return
    if (event.type === 'input_audio_buffer.append') {
      if (typeof event.audio !== 'string' || !event.audio.length || event.audio.length > 44000) throw new Error('passport-invalid-audio')
      const pcm = Buffer.from(event.audio, 'base64')
      if (pcm.toString('base64') !== event.audio || !pcm.length || pcm.length % 2) throw new Error('passport-invalid-audio')
      if (Date.now() - this.inputWindow >= 1000) { this.inputWindow = Date.now(); this.inputBytes = 0 }
      this.inputBytes += pcm.length
      if (this.inputBytes > 64000) throw new Error('passport-input-overflow')
      const wave = this.capture.append(pcm)
      if (wave) this.recognize(wave)
    } else if (event.type === 'input_audio_buffer.commit') {
      const wave = this.capture.commit()
      if (wave) this.recognize(wave)
    } else if (event.type === 'input_audio_buffer.clear') this.capture.reset()
  }

  private async negotiate(event: Event): Promise<void> {
    const protocol = event.protocol as { min?: unknown; max?: unknown } | undefined
    const client = event.client as { instance_id?: unknown } | undefined
    const capabilities = event.capabilities
    if (protocol?.min !== '7.0.0' || protocol.max !== '7.0.0' || typeof client?.instance_id !== 'string'
      || !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(client.instance_id) || !Array.isArray(capabilities)
      || !capabilities.includes('input.audio') || !capabilities.includes('playback.receipts')) throw new Error('passport-protocol-mismatch')
    this.deviceId = client.instance_id
    if (this.bridge.options.deviceId && this.deviceId !== this.bridge.options.deviceId) { this.close(4003, 'device-rejected'); return }
    if (!this.bridge.claim(this)) { this.close(4002, 'occupied'); return }
    this.bridge.checkRecognition()
    const { agent } = await this.bridge.session.acquire()
    if (this.disposed) return
    this.muted = (event.connection as { input_enabled?: unknown } | undefined)?.input_enabled !== true
    this.available = true
    clearTimeout(this.handshake)
    this.send('session.ready', { protocol_version: '7.0.0', session_id: agent.id,
      request_event_id: event.event_id, capabilities: ['input.audio', 'playback.receipts'] })
    this.send('voice.ready', { inputSampleRate: 16000, outputSampleRate: 24000 })
    this.send('voice.state', { state: 'listening' })
  }

  private recognize(wave: Buffer): void {
    this.busy = true
    this.cycle = new AbortController()
    const signal = this.cycle.signal
    this.timeout = setTimeout(() => { this.fail('passport-request-timeout'); this.interrupt() }, this.bridge.options.requestTimeoutMs)
    this.timeout.unref()
    this.send('voice.state', { state: 'processing' })
    const run = async () => {
      this.bridge.checkRecognition()
      validateWave(wave, this.bridge.options.maxRecordingSeconds)
      const spec = this.bridge.recognition.resolve({ audio: wave })
      const result = await this.bridge.recognition.transcribe(spec, signal)
      signal.throwIfAborted()
      if (!result.text.trim()) { this.finish(); return }
      this.submitted = true
      this.bridge.session.submit(result.text.trim())
    }
    void this.bridge.track(run()).catch(() => { if (!signal.aborted) { this.fail('passport-recognition-failed'); this.finish() } })
  }

  observe(event: SessionEvent): void {
    const agent = this.bridge.session.agent
    if (!this.busy || !this.submitted || !agent || event.seq <= this.lastSeq) return
    this.lastSeq = event.seq
    if (event.type === 'turn/start') { this.turn = event.data.turn; this.hasReply = false }
    if (this.turn === undefined) return
    if (event.type === 'assistant/message' && event.data.turn === this.turn) {
      const blocks = event.data.message.content
      this.hasReply = !event.data.interrupted && !blocks.some(block => block.type === 'tool-call')
        && !!prepareTtsText(blocks.filter(block => block.type === 'text').map(block => block.text).join('\n'))
    }
    this.speech.observe(agent, event)
    if (event.type === 'turn/end' && event.data.turn === this.turn) {
      if (event.data.reason.kind !== 'completed') { this.fail('passport-turn-failed'); this.finish() }
      else if (!this.hasReply) this.finish()
    }
  }

  async play(audio: SpeechAudio, caller: AbortSignal): Promise<void> {
    const signal = AbortSignal.any([caller, this.cycle.signal])
    signal.throwIfAborted()
    const pcm = playbackPcm(audio.data, this.bridge.options.maxReplySeconds)
    const id = randomUUID(), receipt = Promise.withResolvers<void>()
    // A cancellation can reject the receipt while paced sends are still in progress.
    void receipt.promise.catch(() => {})
    const aborted = () => receipt.reject(new Error('passport-playback-cancelled'))
    const timeout = setTimeout(() => receipt.reject(new Error('passport-playback-timeout')), pcm.length / 48 + 15000)
    timeout.unref()
    this.playback = { id, doneSent: false, resolve: () => receipt.resolve(), reject: receipt.reject }
    signal.addEventListener('abort', aborted, { once: true })
    try {
      this.send('response.started', { responseId: id })
      for (let offset = 0; offset < pcm.length; offset += 960) {
        signal.throwIfAborted()
        this.send('audio.delta', { responseId: id, sampleRate: 24000, audio: pcm.subarray(offset, offset + 960).toString('base64') })
        await delay(20, undefined, { signal })
      }
      this.playback.doneSent = true
      this.send('audio.done', { responseId: id })
      await receipt.promise
      signal.throwIfAborted()
      this.send('response.done', { responseId: id })
    } catch (error) {
      // Reconnect fences device queues when actual playback settlement is unknown.
      if (!signal.aborted) this.close(1011, 'playback-failed')
      throw error
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', aborted)
      if (this.playback?.id === id) this.playback = undefined
    }
  }

  private fail(code: string): void {
    this.bridge.report(code)
    if (!this.disposed && this.ws.readyState === WebSocket.OPEN) {
      try { this.send('error', { code, message: code }) } catch { this.close(1011, 'transport-error') }
    }
  }

  private finish(): void {
    clearTimeout(this.timeout)
    this.busy = false; this.submitted = false; this.turn = undefined; this.hasReply = false
    this.capture.reset()
    if (this.available && !this.disposed && this.ws.readyState === WebSocket.OPEN) this.send('voice.state', { state: 'listening' })
  }

  private interrupt(): void {
    this.cycle.abort()
    const agent = this.bridge.session.agent
    if (agent) this.speech.release(agent)
    if (this.submitted) this.bridge.session.cancel()
    if (this.available && !this.disposed) this.send('playback.clear')
    this.finish()
  }

  close(code?: number, reason?: string): void {
    if (this.disposed) return
    this.disposed = true; this.available = false
    clearTimeout(this.handshake); clearInterval(this.heartbeat)
    this.interrupt()
    this.bridge.release(this)
    void this.bridge.track(this.speech.dispose())
    if (code && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(code, reason)
      const timer = setTimeout(() => this.ws.terminate(), 1000)
      timer.unref(); this.ws.once('close', () => clearTimeout(timer))
    }
  }
}
