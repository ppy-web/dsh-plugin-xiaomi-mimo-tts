import { normalizeVoiceRate } from '../../shared.js'
import { applyPcmVoiceRate, pcmPlaybackDuration } from './voice-rate.js'

export interface PcmAudioQueueCallbacks {
  onBusyChange: (busy: boolean) => void
  onPlaybackStart: () => void
}

export class PcmAudioQueue {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private volume = 1
  private playbackRate = 1
  private scheduledAt = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private readonly sourceBytes = new Map<AudioBufferSourceNode, number>()
  private readonly markers = new Set<AudioBufferSourceNode>()
  private revision = 0
  private controlRevision = 0
  private chain: Promise<void> = Promise.resolve()
  private busy = false
  private userPaused = false
  private queuedBytes = 0
  private maxPausedPcmBytes = 32 * 1024 * 1024

  constructor(private readonly callbacks: PcmAudioQueueCallbacks) {}

  setMaxPausedPcmBytes(value: number): void { this.maxPausedPcmBytes = Number.isFinite(value) && value > 0 ? value : 32 * 1024 * 1024 }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    const context = this.context
    const gain = this.gain
    if (context === null || gain === null) return
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(this.volume, now + .02)
  }

  setPlaybackRate(value: number): void { this.playbackRate = normalizeVoiceRate(value) }
  getPlaybackRate(): number { return this.playbackRate }

  async pause(): Promise<void> {
    const control = ++this.controlRevision
    const context = this.context
    this.userPaused = true
    try {
      if (context !== null && context.state === 'running') await context.suspend()
    } catch (error) {
      if (control === this.controlRevision) this.userPaused = false
      throw error
    }
    if (context === this.context && context !== null
      && !this.userPaused && this.sources.size > 0 && context.state !== 'running') await context.resume()
  }

  async resume(): Promise<void> {
    this.controlRevision += 1
    const revision = this.revision
    const context = this.context
    if (context !== null && context.state !== 'running') await context.resume()
    if (revision === this.revision) this.userPaused = false
    else if (context === this.context && context !== null && this.userPaused && context.state === 'running') await context.suspend()
  }

  enqueue(base64: string, onStart?: () => void): Promise<void> {
    return this.enqueueBytes(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)), onStart)
  }

  enqueueBytes(bytes: Uint8Array, onStart?: () => void): Promise<void> {
    const revision = this.revision
    const run = this.chain.then(() => this.schedule(bytes, revision, onStart))
    this.chain = run.catch(() => {})
    return run
  }

  stop(): void {
    this.revision += 1
    this.controlRevision += 1
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
    for (const marker of this.markers) {
      try { marker.stop() } catch { /* A marker may already have ended. */ }
    }
    this.markers.clear()
    this.setBusy(false)
  }

  async dispose(): Promise<void> {
    this.stop()
    const context = this.context
    this.context = null
    this.gain?.disconnect()
    this.gain = null
    if (context !== null && context.state !== 'closed') await context.close()
  }

  private async schedule(bytes: Uint8Array, revision: number, onStart?: () => void): Promise<void> {
    if (revision !== this.revision) {
      return
    }
    if (bytes.byteLength % 2) throw new Error('invalid-pcm-sample')
    if (bytes.byteLength < 2) {
      return
    }
    const context = this.getContext()
    if (context.state !== 'running' && !this.userPaused) {
      await context.resume()
    }
    if (revision !== this.revision) return

    const sampleCount = Math.floor(bytes.byteLength / 2)
    const buffer = context.createBuffer(1, sampleCount, 24000)
    const channel = buffer.getChannelData(0)
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < sampleCount; index += 1) channel[index] = pcm.getInt16(index * 2, true) / 0x8000

    const source = context.createBufferSource()
    source.buffer = buffer
    applyPcmVoiceRate(source, this.playbackRate)
    source.connect(this.getGain(context))
    const startAt = Math.max(context.currentTime + 0.03, this.scheduledAt)
    this.scheduledAt = startAt + pcmPlaybackDuration(buffer.duration, this.playbackRate)
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
    if (onStart !== undefined) this.scheduleMarker(context, startAt, revision, onStart)
    this.setBusy(true)
    if (!this.userPaused && context.state === 'running') this.callbacks.onPlaybackStart()
  }

  /** A silent one-sample marker fires on the audio clock, including after a pause. */
  private scheduleMarker(context: AudioContext, startAt: number, revision: number, onStart: () => void): void {
    let marker: AudioBufferSourceNode | undefined
    try {
      marker = context.createBufferSource()
      const scheduled = marker
      marker.buffer = context.createBuffer(1, 1, 24000)
      marker.connect(this.getGain(context))
      this.markers.add(marker)
      marker.addEventListener('ended', () => {
        this.markers.delete(scheduled)
        try { scheduled.disconnect() } catch { /* The cue is already detached. */ }
        if (revision === this.revision && this.sources.size > 0) onStart()
      }, { once: true })
      // End the silent marker exactly as the first sample begins, including for tiny PCM chunks.
      marker.start(startAt - marker.buffer.duration)
    } catch {
      if (marker !== undefined) { this.markers.delete(marker); try { marker.disconnect() } catch { /* Ignore cue cleanup failures. */ } }
      // A subtitle cue must never interrupt audio playback.
    }
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.callbacks.onBusyChange(busy)
  }

  private getContext(): AudioContext {
    if (this.context === null) {
      this.context = new AudioContext()
    }
    return this.context
  }

  private getGain(context: AudioContext): GainNode {
    if (this.gain === null) {
      this.gain = context.createGain()
      this.gain.gain.value = this.volume
      this.gain.connect(context.destination)
    }
    return this.gain
  }

}
