import { TTS_DUPLEX_ROUTE } from '../../constants.js'
import type { TtsSelection } from '../../types/providers.js'
import { hostWebSocketUrl } from '../host-route.js'

export class DuplexPcmError extends Error {
  constructor(readonly code: string, message = code) { super(message) }
}

/** One message's appendable PCM stream. Sending text never waits for audio completion. */
export class DuplexPcmStream {
  readonly done: Promise<void>
  private resolve!: () => void
  private reject!: (error: unknown) => void
  private readonly socket: WebSocket
  private ready = false
  private ended = false
  private terminal = false
  private finishing = false
  private readonly pending: string[] = []
  private pendingBytes = 0
  private textLength = 0
  private chain: Promise<void> = Promise.resolve()
  private tail: number | null = null
  private received = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(selection: TtsSelection, private readonly signal: AbortSignal, private readonly consume: (bytes: Uint8Array) => void | Promise<void>, private readonly limit = 32 * 1024 * 1024, private readonly timeoutMs = 120000, private readonly maxTextLength = 12000) {
    this.done = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
    void this.done.catch(() => {})
    this.socket = new WebSocket(hostWebSocketUrl(TTS_DUPLEX_ROUTE))
    this.socket.binaryType = 'arraybuffer'
    this.socket.onopen = () => { if (!this.ended) this.socket.send(JSON.stringify({ type: 'start', selection })) }
    this.socket.onmessage = event => {
      if (this.ended || this.terminal) return
      this.arm()
      if (event.data instanceof ArrayBuffer) {
        if (!this.ready) { this.fail(new DuplexPcmError('invalid-session-state')); return }
        const bytes = new Uint8Array(event.data)
        this.pendingBytes += bytes.length
        if (this.pendingBytes > this.limit) { this.fail(new DuplexPcmError('stream-buffer-limit')); return }
        this.chain = this.chain.then(async () => {
          if (this.ended || this.signal.aborted) return
          let aligned = bytes
          if (this.tail !== null) {
            aligned = new Uint8Array(bytes.length + 1)
            aligned[0] = this.tail
            aligned.set(bytes, 1)
            this.tail = null
          }
          if (aligned.length % 2) { this.tail = aligned[aligned.length - 1]!; aligned = aligned.subarray(0, aligned.length - 1) }
          if (aligned.length) { await this.consume(aligned); this.received = true }
        }).catch(error => this.fail(error)).finally(() => { this.pendingBytes -= bytes.length })
      } else {
        try {
          const message = JSON.parse(String(event.data)) as { type: string; error?: string; message?: string; sampleRate?: number; channels?: number; sampleFormat?: string }
          if (message.type === 'ready' && !this.ready && message.sampleRate === 24000 && message.channels === 1 && message.sampleFormat === 's16le') {
            this.ready = true
            for (const text of this.pending.splice(0)) this.sendText(text)
            if (this.finishing) this.socket.send(JSON.stringify({ type: 'finish' }))
          } else if (message.type === 'error') this.fail(new DuplexPcmError(message.error ?? 'request-failed', message.message))
          else if (message.type === 'done' && this.ready && this.finishing) {
            this.terminal = true
            void this.chain.then(() => {
              if (this.ended) return
              if (this.tail !== null) { this.fail(new DuplexPcmError('invalid-pcm-sample')); return }
              if (!this.received) { this.fail(new DuplexPcmError('stream-audio-empty')); return }
              this.ended = true
              this.cleanup()
              this.resolve()
            })
          } else this.fail(new DuplexPcmError('invalid-session-state'))
        } catch { this.fail(new DuplexPcmError('invalid-stream-response')) }
      }
    }
    this.socket.onclose = () => { if (!this.terminal && !this.ended) this.fail(new DuplexPcmError('stream-connection-closed')) }
    this.socket.onerror = () => this.fail(new DuplexPcmError('request-failed'))
    signal.addEventListener('abort', this.onAbort, { once: true })
    this.arm(Math.min(10000, timeoutMs))
    if (signal.aborted) this.onAbort()
  }

  append(text: string): void {
    if (this.ended || this.finishing) throw new DuplexPcmError('invalid-session-state')
    if (!text.trim()) return
    this.textLength += text.length
    if (this.textLength > this.maxTextLength) {
      const error = new DuplexPcmError('text-too-long')
      this.fail(error)
      throw error
    }
    if (this.ready) this.sendText(text)
    else this.pending.push(text)
    this.arm(this.ready ? this.timeoutMs : Math.min(10000, this.timeoutMs))
  }

  finish(): Promise<void> {
    if (!this.ended && !this.finishing) {
      this.finishing = true
      if (this.ready) this.socket.send(JSON.stringify({ type: 'finish' }))
    }
    return this.done
  }

  private sendText(text: string): void { this.socket.send(JSON.stringify({ type: 'text', text })) }
  private onAbort = (): void => { this.fail(new DOMException('Synthesis canceled', 'AbortError')) }
  private arm(ms = this.timeoutMs): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fail(new DuplexPcmError('tts-timeout')), ms)
  }
  private cleanup(): void {
    clearTimeout(this.timer)
    this.signal.removeEventListener('abort', this.onAbort)
    this.socket.onopen = null
    this.socket.onmessage = null
    this.socket.onclose = null
    this.socket.onerror = null
    this.socket.close()
  }
  private fail(error: unknown): void {
    if (this.ended) return
    this.ended = true
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel' }))
    this.cleanup()
    this.reject(error)
  }
}
