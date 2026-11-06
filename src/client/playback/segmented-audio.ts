import { TTS_ROUTE } from '../../shared.js'
import { hostRoute } from '../host-route.js'
import { applyMediaVoiceRate } from './voice-rate.js'
import { externalEngine, speechRequestBody } from '../engine-state.js'

type SegmentAudioResult = { ok: true; blob: Blob } | { ok: false; error: unknown }

/** Observe prefetch failures immediately, even while the preceding segment is still playing. */
export async function prefetchSegmentAudio(text: string, signal: AbortSignal): Promise<SegmentAudioResult> {
  try {
    let lastError: unknown
    const body = speechRequestBody({ text, format: 'wav' })
    for (let attempt = 0; attempt < (externalEngine() ? 1 : 2); attempt += 1) {
      signal.throwIfAborted()
      try {
        const response = await fetch(hostRoute(TTS_ROUTE), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body), signal,
        })
        if (!response.ok) throw new Error(`segment-request-${response.status}`)
        return { ok: true, blob: await response.blob() }
      } catch (error) { lastError = error }
    }
    throw lastError
  } catch (error) { return { ok: false, error } }
}

interface SegmentPlaybackOptions {
  signal: AbortSignal
  volume: number
  voiceRate: number
  automatic: boolean
  onCreated: (audio: HTMLAudioElement) => void
  onReleased: (audio: HTMLAudioElement) => void
  onStarted: () => void
}

/** One segment owns its media, listeners, cancellation settlement, and object URL. */
export function playSegmentAudio(blob: Blob, options: SegmentPlaybackOptions): Promise<void> {
  const url = URL.createObjectURL(blob)
  let audio: HTMLAudioElement
  try {
    audio = new Audio(url)
    audio.volume = options.volume
    applyMediaVoiceRate(audio, options.voiceRate)
  } catch (error) {
    URL.revokeObjectURL(url)
    return Promise.reject(error)
  }
  options.onCreated(audio)
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: unknown): void => {
      if (settled) return
      settled = true
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('error', failed)
      options.signal.removeEventListener('abort', aborted)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      options.onReleased(audio)
      if (error === undefined) resolve()
      else reject(error)
    }
    const ended = (): void => finish()
    const failed = (): void => finish(new Error('segment-play-failed'))
    const aborted = (): void => finish(options.signal.reason ?? new DOMException('Playback cancelled', 'AbortError'))
    audio.addEventListener('ended', ended)
    audio.addEventListener('error', failed)
    options.signal.addEventListener('abort', aborted, { once: true })
    if (options.signal.aborted) { aborted(); return }
    void audio.play().then(() => {
      if (!settled && !options.signal.aborted) options.onStarted()
    }).catch(() => finish(new Error(options.automatic ? 'autoplay-blocked' : 'play-failed')))
  })
}
