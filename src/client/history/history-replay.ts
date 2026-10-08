import type { AudioHistory, AudioHistoryEntry } from './audio-history.js'
import { applyMediaVoiceRate } from '../playback/voice-rate.js'

export interface HistoryReplayView {
  entryId: string | null
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
  currentTime: number
  duration: number
  error: 'blocked' | 'decode' | 'failed' | null
}

const idle = (): HistoryReplayView => ({ entryId: null, status: 'idle', currentTime: 0, duration: 0, error: null })

/** A single active media instance; stale media events and play promises cannot publish. */
export class HistoryReplay {
  private view = idle()
  private listeners = new Set<() => void>()
  private media: HTMLAudioElement | null = null
  private url: string | null = null
  private cleanup: (() => void) | null = null
  private epoch = 0
  private attempt = 0
  private volume = 1
  private voiceRate = 1
  private disposed = false
  private offStop: (() => void) | null = null
  private offHistory: (() => void) | null = null

  constructor(private readonly history: AudioHistory, private beforePlayback: () => void) {}

  /** Called by the page effect, so interrupted React renders never subscribe. */
  activate(): void {
    if (this.offStop !== null) return
    this.disposed = false
    this.offStop = this.history.onStopReplay(() => this.pause())
    this.offHistory = this.history.subscribe(() => {
      if (this.view.entryId !== null && !this.history.getSnapshot().entries.some((entry) => entry.id === this.view.entryId)) this.stop()
    })
  }

  getSnapshot = (): HistoryReplayView => this.view
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  configure(volume: number, voiceRate: number, beforePlayback: () => void): void {
    this.volume = volume
    this.voiceRate = voiceRate
    this.beforePlayback = beforePlayback
    if (this.media !== null) {
      this.media.volume = volume
      applyMediaVoiceRate(this.media, voiceRate)
    }
  }

  async play(entry: AudioHistoryEntry): Promise<void> {
    if (this.disposed) return
    this.beforePlayback()
    if (this.view.entryId !== entry.id || this.media === null || this.view.status === 'error') {
      this.release()
      const epoch = this.epoch
      try {
        this.url = URL.createObjectURL(entry.blob)
        const media = new Audio(this.url)
        this.media = media
        media.preload = 'metadata'
        media.volume = this.volume
        applyMediaVoiceRate(media, this.voiceRate)
        const valid = (): boolean => !this.disposed && this.media === media && this.epoch === epoch
        const timing = (): void => {
          if (valid()) this.publish({ ...this.view, currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
            duration: Number.isFinite(media.duration) ? media.duration : 0 })
        }
        const ended = (): void => {
          if (!valid()) return
          this.attempt += 1
          this.publish({ ...this.view, status: 'ended', currentTime: this.view.duration })
        }
        const error = (): void => {
          if (!valid()) return
          this.attempt += 1
          this.publish({ ...this.view, status: 'error', error: media.error?.code === 3 || media.error?.code === 4 ? 'decode' : 'failed' })
        }
        for (const event of ['loadedmetadata', 'durationchange', 'timeupdate']) media.addEventListener(event, timing)
        media.addEventListener('ended', ended)
        media.addEventListener('error', error)
        this.cleanup = () => {
          for (const event of ['loadedmetadata', 'durationchange', 'timeupdate']) media.removeEventListener(event, timing)
          media.removeEventListener('ended', ended)
          media.removeEventListener('error', error)
        }
        this.publish({ ...idle(), entryId: entry.id })
      } catch {
        this.release()
        this.publish({ ...idle(), entryId: entry.id, status: 'error', error: 'failed' })
        return
      }
    }
    const media = this.media!
    if (this.view.status === 'ended') media.currentTime = 0
    const attempt = ++this.attempt
    const epoch = this.epoch
    this.publish({ ...this.view, status: 'loading', error: null })
    try {
      await media.play()
      if (!this.disposed && this.media === media && epoch === this.epoch && attempt === this.attempt) this.publish({ ...this.view, status: 'playing' })
    } catch (error) {
      if (!this.disposed && this.media === media && epoch === this.epoch && attempt === this.attempt) {
        this.publish({ ...this.view, status: 'error', error: error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'failed' })
      }
    }
  }

  pause(): void {
    if (this.media === null || (this.view.status !== 'playing' && this.view.status !== 'loading')) return
    this.attempt += 1
    this.media.pause()
    this.publish({ ...this.view, status: 'paused' })
  }

  seek(seconds: number): void {
    if (this.media === null || this.view.duration <= 0 || !Number.isFinite(seconds)) return
    const currentTime = Math.max(0, Math.min(this.view.duration, seconds))
    this.media.currentTime = currentTime
    this.publish({ ...this.view, currentTime, status: this.view.status === 'ended' ? 'paused' : this.view.status })
  }

  stop(): void {
    this.release()
    this.publish(idle())
  }

  dispose(): void {
    this.disposed = true
    this.offStop?.()
    this.offHistory?.()
    this.offStop = null
    this.offHistory = null
    this.stop()
    this.listeners.clear()
  }

  private release(): void {
    this.epoch += 1
    this.attempt += 1
    this.cleanup?.()
    this.cleanup = null
    if (this.media !== null) {
      this.media.pause()
      this.media.removeAttribute('src')
      this.media.load()
      this.media = null
    }
    if (this.url !== null) URL.revokeObjectURL(this.url)
    this.url = null
  }

  private publish(view: HistoryReplayView): void {
    this.view = view
    for (const listener of this.listeners) listener()
  }
}
