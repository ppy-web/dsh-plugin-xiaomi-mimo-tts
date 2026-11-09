import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { WebSocket } from 'ws'
import type { RecognitionInput } from './recognition.js'
import { recognitionError, doubaoRecognitionError } from './asr-error.js'

/** One bounded ASR session per utterance. Partial/definite sentences are never committed. */
export class DoubaoRecognition implements RecognitionInput {
  private socket!: WebSocket
  private readonly result = Promise.withResolvers<string>()
  private chunks: Buffer[] = []
  private bytes = 0
  private total = 0
  private sequence = 1
  private opened = false
  private ending = false
  private settled = false
  private failure: Error | undefined
  private timer: ReturnType<typeof setTimeout>
  private readonly abort = () => this.fail(new Error('passport-recognition-cancelled'))
  constructor(private readonly key: string, private readonly signal: AbortSignal, private readonly maxBytes: number,
    plan = false, private readonly remember: (plan: boolean) => void = () => {},
    private readonly connector?: (url: string, headers: Record<string, string>) => WebSocket,
    private readonly mode: 'async' | 'nostream' = 'async') {
    void this.result.promise.catch(() => {})
    this.timer = setTimeout(() => this.fail(new Error('passport-asr-timeout')), 10000)
    this.timer.unref()
    signal.addEventListener('abort', this.abort, { once: true })
    this.connect(plan, !plan)
    if (signal.aborted) this.abort()
  }
  private connect(plan: boolean, retry: boolean): void {
    const url = `wss://openspeech.bytedance.com/api/v3/${plan ? 'plan/' : ''}sauc/bigmodel_${this.mode}`
    const headers = { 'X-Api-Key': this.key, 'X-Api-Resource-Id': 'volc.seedasr.sauc.duration', 'X-Api-Request-Id': randomUUID(), 'X-Api-Sequence': '-1' }
    const ws = this.socket = this.connector?.(url, headers) ?? new WebSocket(url, {
      headers,
      handshakeTimeout: 10000, maxPayload: 256 * 1024, followRedirects: false,
    })
    ws.on('unexpected-response', (_request, response) => {
      response.resume()
      if (this.settled || ws !== this.socket) return
      const status = response.statusCode ?? 502
      if (retry && (status === 401 || status === 403)) {
        ws.removeAllListeners(); ws.on('error', () => {}); ws.terminate()
        this.connect(true, false)
      } else this.fail(recognitionError(status))
    })
    ws.on('open', () => {
      if (this.settled) return
      try {
      clearTimeout(this.timer)
      this.remember(plan)
      this.opened = true
      this.send(1, Buffer.from(JSON.stringify({ user: { uid: 'dsh-passport' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, result_type: 'full', show_utterances: false } })))
      this.flush()
      } catch { this.fail(new Error('passport-asr-network-failed')) }
    })
    ws.on('message', data => {
      if (this.settled || ws !== this.socket) return
      try {
        const frame = Buffer.from(data as Buffer)
        if (frame.length < 8 || frame[0]! >> 4 !== 1) throw new Error('passport-asr-invalid-response')
        const kind = frame[1]! >> 4, flags = frame[1]! & 15
        let offset = (frame[0]! & 15) * 4
        if (kind === 15) {
          if (frame.length < offset + 8) throw new Error('passport-asr-invalid-response')
          const code = frame.readUInt32BE(offset)
          const length = frame.readUInt32BE(offset + 4)
          if (length !== frame.length - offset - 8) throw new Error('passport-asr-invalid-response')
          const data = (frame[2]! & 15) === 1 ? gunzipSync(frame.subarray(offset + 8), { maxOutputLength: 256 * 1024 }) : frame.subarray(offset + 8)
          throw doubaoRecognitionError(code, data.toString())
        }
        if (kind !== 9) throw new Error('passport-asr-invalid-response')
        if (flags & 1) offset += 4
        if (frame.length < offset + 4) throw new Error('passport-asr-invalid-response')
        const size = frame.readUInt32BE(offset); offset += 4
        if (size !== frame.length - offset) throw new Error('passport-asr-invalid-response')
        const payload = (frame[2]! & 15) === 1 ? gunzipSync(frame.subarray(offset), { maxOutputLength: 256 * 1024 }) : frame.subarray(offset)
        const value = JSON.parse(payload.toString()) as { code?: number; message?: string; result?: { text?: unknown } }
        if (value.code && value.code !== 1000 && value.code !== 20000000) throw doubaoRecognitionError(value.code, value.message)
        if (flags & 2) {
          if (!this.ending || this.bytes || typeof value.result?.text !== 'string') throw new Error('passport-asr-invalid-response')
          this.settled = true; this.cleanup(); this.result.resolve(value.result.text.trim()); ws.close()
        }
      } catch (error) { this.fail(error instanceof Error ? error : new Error('passport-asr-invalid-response')) }
    })
    ws.on('error', () => { if (ws === this.socket) this.fail(new Error('passport-asr-network-failed')) })
    ws.on('close', () => { if (ws === this.socket && !this.settled) this.fail(new Error('passport-asr-network-failed')) })
  }
  private send(kind: number, data: Buffer, last = false): void {
    if (this.socket.bufferedAmount > this.maxBytes) throw new Error('passport-asr-input-overflow')
    const payload = gzipSync(data)
    const header = Buffer.alloc(12)
    header[0] = 0x11; header[1] = (kind << 4) | (last ? 3 : 1); header[2] = kind === 1 ? 0x11 : 0x01
    header.writeInt32BE(last ? -this.sequence++ : this.sequence++, 4)
    header.writeUInt32BE(payload.length, 8)
    this.socket.send(Buffer.concat([header, payload]), error => { if (error) this.fail(new Error('passport-asr-network-failed')) })
  }
  append(pcm: Buffer): void {
    this.signal.throwIfAborted()
    if (this.settled || this.ending) throw this.failure ?? new Error('passport-recognition-cancelled')
    this.total += pcm.length
    if (this.total > this.maxBytes) throw new Error('passport-recording-too-long')
    this.chunks.push(Buffer.from(pcm)); this.bytes += pcm.length
    this.flush()
  }
  private flush(): void {
    if (!this.opened || this.settled) return
    try {
      while (this.bytes >= 6400 || this.ending && this.bytes) {
        const all = Buffer.concat(this.chunks), length = Math.min(6400, all.length)
        this.send(2, all.subarray(0, length))
        this.chunks = all.length > length ? [all.subarray(length)] : []; this.bytes -= length
      }
      if (this.ending) this.send(2, Buffer.alloc(0), true)
    } catch (error) { this.fail(error instanceof Error ? error : new Error('passport-asr-network-failed')) }
  }
  finish(): Promise<string> {
    if (!this.ending && !this.settled) {
      this.ending = true
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.fail(new Error('passport-asr-timeout')), 30000)
      this.timer.unref(); this.flush()
    }
    return this.result.promise
  }
  cancel(): void { this.abort() }
  private cleanup(): void { clearTimeout(this.timer); this.signal.removeEventListener('abort', this.abort); this.chunks = []; this.bytes = 0 }
  private fail(error: Error): void {
    if (this.settled) return
    this.settled = true; this.failure = error; this.cleanup(); this.result.reject(error); this.socket.terminate()
  }
}
