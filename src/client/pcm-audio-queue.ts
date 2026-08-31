export interface PcmAudioQueueCallbacks {
  onBusyChange: (busy: boolean) => void
  onPlaybackStart: () => void
}

export class PcmAudioQueue {
  private context: AudioContext | null = null
  private scheduledAt = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private readonly sourceBytes = new Map<AudioBufferSourceNode, number>()
  private revision = 0
  private chain: Promise<void> = Promise.resolve()
  private busy = false
  private userPaused = false
  private queuedBytes = 0
  private maxPausedPcmBytes = 32 * 1024 * 1024

  constructor(private readonly callbacks: PcmAudioQueueCallbacks) {}

  setMaxPausedPcmBytes(value: number): void { this.maxPausedPcmBytes = Number.isFinite(value) && value > 0 ? value : 32 * 1024 * 1024 }

  async pause(): Promise<void> {
    this.userPaused = true
    if (this.context !== null && this.context.state === 'running') await this.context.suspend()
  }

  async resume(): Promise<void> {
    if (this.context !== null && this.context.state !== 'running') await this.context.resume()
    this.userPaused = false
  }

  enqueue(base64: string): Promise<void> {
    const revision = this.revision
    const run = this.chain.then(() => this.schedule(base64, revision))
    this.chain = run.catch(() => {})
    return run
  }

  stop(): void {
    this.revision += 1
    this.scheduledAt = 0
    this.chain = Promise.resolve()
    this.userPaused = false
    this.queuedBytes = 0
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // A source may already have ended while the stop path is running.
      }
    }
    this.sources.clear()
    this.sourceBytes.clear()
    this.setBusy(false)
  }

  async dispose(): Promise<void> {
    this.stop()
    const context = this.context
    this.context = null
    if (context !== null && context.state !== 'closed') await context.close()
  }

  private async schedule(base64: string, revision: number): Promise<void> {
    if (revision !== this.revision) return
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    if (bytes.byteLength < 2) return
    const context = this.getContext()
    if (context.state !== 'running' && !this.userPaused) await context.resume()
    if (revision !== this.revision) return

    const sampleCount = Math.floor(bytes.byteLength / 2)
    const buffer = context.createBuffer(1, sampleCount, 24000)
    const channel = buffer.getChannelData(0)
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < sampleCount; index += 1) channel[index] = pcm.getInt16(index * 2, true) / 0x8000

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime + 0.03, this.scheduledAt)
    this.scheduledAt = startAt + buffer.duration
    if (this.userPaused && this.queuedBytes + bytes.byteLength > this.maxPausedPcmBytes) throw new Error('pcm-pause-buffer-limit')
    this.sources.add(source)
    this.sourceBytes.set(source, bytes.byteLength)
    this.queuedBytes += bytes.byteLength
    source.addEventListener('ended', () => {
      if (revision !== this.revision) return
      this.sources.delete(source)
      this.queuedBytes -= this.sourceBytes.get(source) ?? 0
      this.sourceBytes.delete(source)
      if (this.sources.size === 0) this.setBusy(false)
    }, { once: true })
    try {
      source.start(startAt)
    } catch (error) {
      this.sources.delete(source)
      this.queuedBytes -= this.sourceBytes.get(source) ?? 0
      this.sourceBytes.delete(source)
      throw error
    }
    this.setBusy(true)
    this.callbacks.onPlaybackStart()
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.callbacks.onBusyChange(busy)
  }

  private getContext(): AudioContext {
    if (this.context === null) this.context = new AudioContext()
    return this.context
  }
}
