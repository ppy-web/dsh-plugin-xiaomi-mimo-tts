import { applyMediaVoiceRate } from './voice-rate.js'

export interface MossAudioHandle {
  /** Resolves when playback ends or is stopped; rejects on playback failure. */
  readonly done: Promise<void>
  pause(): void
  resume(): Promise<void>
  stop(): void
}

interface MossAudioOptions {
  volume: number
  rate: number
  timeoutMs?: number
  onStart?: () => void
}

/**
 * Play one WAV blob through an `Audio` element with the same volume/rate
 * semantics as the cloud players. Pause and stop are idempotent.
 */
export function playMossAudio(blob: Blob, options: MossAudioOptions): MossAudioHandle {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : 1
  applyMediaVoiceRate(audio, options.rate)
  let settled = false
  let started = false
  let timer: number | undefined
  let resolveDone: () => void = () => {}
  let rejectDone: (error: Error) => void = () => {}

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const cleanup = (): void => {
    audio.onended = null
    audio.onerror = null
    audio.onplaying = null
    if (timer !== undefined) window.clearTimeout(timer)
    URL.revokeObjectURL(url)
  }
  const finish = (error?: Error): void => {
    if (settled) return
    settled = true
    cleanup()
    if (error === undefined) resolveDone()
    else rejectDone(error)
  }
  const markStarted = (): void => {
    if (started) return
    started = true
    options.onStart?.()
  }

  audio.onplaying = markStarted
  audio.onended = () => { finish() }
  audio.onerror = () => { finish(new Error('moss-audio-failed')) }
  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    timer = window.setTimeout(() => {
      audio.pause()
      finish(new Error('local-speech-timeout'))
    }, options.timeoutMs)
  }
  void audio.play().then(markStarted, () => { finish(new Error('autoplay-blocked')) })

  return {
    done,
    pause() { if (!settled) audio.pause() },
    async resume() {
      if (settled) return
      try {
        await audio.play()
        markStarted()
      } catch {
        finish(new Error('autoplay-blocked'))
      }
    },
    stop() {
      if (settled) return
      audio.pause()
      finish()
    },
  }
}
