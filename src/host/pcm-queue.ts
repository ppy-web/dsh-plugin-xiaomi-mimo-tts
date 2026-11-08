import { abortable } from './external-providers.js'
import { TtsProviderError } from './provider-error.js'

/** Callback producers fail rather than allocate beyond the configured budget. */
export class PcmQueue implements AsyncIterable<Uint8Array> {
  private chunks: Uint8Array[] = []
  private size = 0
  private done = false
  private error: unknown
  private wake = Promise.withResolvers<void>()
  private space = Promise.withResolvers<void>()
  constructor(private readonly limit: number, private readonly signal: AbortSignal) {}
  push(bytes: Uint8Array): void {
    this.signal.throwIfAborted()
    if (this.done) throw new TtsProviderError('stream-closed')
    if (this.size + bytes.length > this.limit) throw new TtsProviderError('stream-buffer-limit')
    if (!bytes.length) return
    this.chunks.push(Buffer.from(bytes)); this.size += bytes.length; this.wake.resolve()
  }
  end(error?: unknown): void { this.done = true; this.error = error; this.wake.resolve() }
  async write(bytes: Uint8Array): Promise<void> {
    for (let offset = 0; offset < bytes.length;) {
      this.signal.throwIfAborted()
      if (this.size >= this.limit) { await abortable(this.space.promise, this.signal); continue }
      const length = Math.min(bytes.length - offset, this.limit - this.size)
      if (length <= 0) throw new TtsProviderError('stream-buffer-limit')
      this.push(bytes.subarray(offset, offset + length)); offset += length
    }
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    try {
      for (;;) {
        this.signal.throwIfAborted()
        if (this.error) throw this.error
        const chunk = this.chunks.shift()
        if (chunk) { this.size -= chunk.length; this.space.resolve(); this.space = Promise.withResolvers<void>(); yield chunk; continue }
        if (this.done) return
        await abortable(this.wake.promise, this.signal)
        this.wake = Promise.withResolvers<void>()
      }
    } finally { this.chunks = []; this.size = 0 }
  }
}
