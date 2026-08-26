export interface PcmAudioQueueCallbacks {
  onBusyChange: (busy: boolean) => void
  onPlaybackStart: () => void
}

export class PcmAudioQueue {
  private context: AudioContext | null = null
  private scheduledAt = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private revision = 0
  private chain: Promise<void> = Promise.resolve()
  private busy = false

  constructor(private readonly callbacks: PcmAudioQueueCallbacks) {}

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
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // A source may already have ended while the stop path is running.
      }
    }
    this.sources.clear()
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
    if (context.state !== 'running') await context.resume()
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
    this.sources.add(source)
    source.addEventListener('ended', () => {
      if (revision !== this.revision) return
      this.sources.delete(source)
      if (this.sources.size === 0) this.setBusy(false)
    }, { once: true })
    try {
      source.start(startAt)
    } catch (error) {
      this.sources.delete(source)
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
