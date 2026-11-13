import { stripBreezeAudioTags, stripXiaomiAudioTags, supportsXiaomiAudioTags } from '../../shared.js'
import type { TtsSelection } from '../../types/providers.js'
import { externalEngine, externalFallbackText } from '../engine-state.js'
import { captionLineAt, splitCaptionLines, type CaptionLine } from './caption-lines.js'

export interface ReadingCaptionView {
  sessionId: string | null
  text: string
  previousText: string
  paused: boolean
}

export interface CaptionTiming {
  /** Media time and duration are in the same units. Unknown values use the speech-rate estimate. */
  elapsed?: () => number
  duration?: () => number
  rate?: number
  /** Identifies a media instance whose pause/resume retains its playback position. */
  source?: object
}

interface CaptionScheduler {
  now: () => number
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel: (timer: ReturnType<typeof setTimeout>) => void
}

const DEFAULT_SCHEDULER: CaptionScheduler = {
  now: () => performance.now() / 1000,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer),
}

export function mediaCaptionTiming(audio: HTMLAudioElement): CaptionTiming {
  return { elapsed: () => audio.currentTime, duration: () => audio.duration, source: audio }
}

/** The displayed text follows the active player, independently of message settlement. */
export class ReadingCaptions {
  private view: ReadingCaptionView = { sessionId: null, text: '', previousText: '', paused: false }
  private owner: object | null = null
  private readonly listeners = new Set<() => void>()
  private segmentText = ''
  private lines: CaptionLine[] = []
  private lineIndex = 0
  private timing: CaptionTiming = {}
  private elapsed = 0
  private startedAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly scheduler: CaptionScheduler = DEFAULT_SCHEDULER) {}

  getSnapshot = (): ReadingCaptionView => this.view
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.scheduleTick()
    return () => { this.listeners.delete(listener); if (this.listeners.size === 0) this.cancelTick() }
  }

  show(owner: object, sessionId: string | null, text: string, timing: CaptionTiming = {}): void {
    if (sessionId === null || !text.trim()) { this.clear(owner); return }
    const samePlayback = this.owner === owner && this.view.sessionId === sessionId
    if (samePlayback && this.segmentText === text && timing.source !== undefined && timing.source === this.timing.source) {
      this.setPaused(owner, false)
      return
    }
    const lines = splitCaptionLines(text)
    if (lines.length === 0) { this.clear(owner); return }
    const previousText = samePlayback && this.segmentText !== text ? this.view.text : ''
    this.cancelTick()
    this.owner = owner
    this.segmentText = text
    this.lines = lines
    this.lineIndex = 0
    this.timing = timing
    this.elapsed = 0
    this.startedAt = this.scheduler.now()
    this.view = { sessionId, text: lines[0]!.text, previousText, paused: false }
    this.notify()
    this.scheduleTick()
  }

  clear(owner: object): void {
    if (this.owner !== owner) return
    this.cancelTick()
    this.owner = null
    this.segmentText = ''
    this.lines = []
    this.timing = {}
    this.view = { sessionId: null, text: '', previousText: '', paused: false }
    this.notify()
  }

  setPaused(owner: object, paused: boolean): void {
    if (this.owner !== owner || this.view.paused === paused) return
    if (paused) {
      this.elapsed += Math.max(0, this.scheduler.now() - this.startedAt)
      this.cancelTick()
    } else {
      this.startedAt = this.scheduler.now()
    }
    this.view = { ...this.view, paused }
    this.notify()
    if (!paused) this.scheduleTick()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private cancelTick(): void {
    if (this.timer === null) return
    this.scheduler.cancel(this.timer)
    this.timer = null
  }

  private scheduleTick(): void {
    if (this.timer !== null || this.listeners.size === 0 || this.owner === null || this.view.paused || this.lineIndex >= this.lines.length - 1) return
    this.timer = this.scheduler.schedule(() => {
      this.timer = null
      const mediaElapsed = this.timing.elapsed?.()
      const elapsed = mediaElapsed !== undefined && Number.isFinite(mediaElapsed) && mediaElapsed >= 0
        ? mediaElapsed : this.elapsed + Math.max(0, this.scheduler.now() - this.startedAt)
      const next = Math.max(this.lineIndex, captionLineAt(this.lines, elapsed, this.timing.duration?.(), this.timing.rate))
      if (next !== this.lineIndex) {
        this.lineIndex = next
        this.view = { ...this.view, previousText: this.lines[next - 1]?.text ?? this.view.text, text: this.lines[next]!.text }
        this.notify()
      }
      this.scheduleTick()
    }, 100)
  }
}

/** Remove audio controls while retaining the words actually sent for synthesis. */
export function readingCaptionText(text: string, selection?: TtsSelection): string {
  const value = externalEngine() ? externalFallbackText(text)
    : selection?.provider === 'breeze' ? stripBreezeAudioTags(text)
      : selection && supportsXiaomiAudioTags(selection) ? stripXiaomiAudioTags(text) : text
  return value.replace(/\s+/gu, ' ').trim()
}
