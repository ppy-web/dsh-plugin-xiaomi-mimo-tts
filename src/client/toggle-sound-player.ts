import {
  TTS_TOGGLE_AUDIO_ASSET_ROUTE,
  TTS_TOGGLE_SOUND_FILES,
} from '../shared.js'
import type { TtsToggleSoundKind } from '../shared.js'

export const TOGGLE_SOUND_DEBOUNCE_MS = 200

function hostRoute(path: string): string {
  const relative = path.replace(/^\/+/, '')
  return typeof document === 'undefined' ? `/${relative}` : new URL(relative, document.baseURI).pathname
}

export class ToggleSoundPlayer {
  private timer: number | null = null
  private audio: HTMLAudioElement | null = null
  private readonly lastIndex = new Map<TtsToggleSoundKind, number>()

  schedule(kind: TtsToggleSoundKind): void {
    this.clearTimer()
    this.releaseAudio()
    if (typeof window === 'undefined') return
    this.timer = window.setTimeout(() => {
      this.timer = null
      this.play(kind)
    }, TOGGLE_SOUND_DEBOUNCE_MS)
  }

  dispose(): void {
    this.clearTimer()
    this.releaseAudio()
  }

  private play(kind: TtsToggleSoundKind): void {
    const files = TTS_TOGGLE_SOUND_FILES[kind]
    const previous = this.lastIndex.get(kind)
    let index = Math.floor(Math.random() * files.length)
    if (files.length > 1 && index === previous) index = (index + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length
    this.lastIndex.set(kind, index)

    const audio = new Audio(hostRoute(`${TTS_TOGGLE_AUDIO_ASSET_ROUTE}/${files[index]}`))
    this.audio = audio
    audio.preload = 'auto'
    const release = (): void => {
      if (this.audio !== audio) return
      audio.onended = null
      audio.onerror = null
      this.releaseAudio()
    }
    audio.onended = release
    audio.onerror = release
    void audio.play().catch(release)
  }

  private clearTimer(): void {
    if (this.timer === null || typeof window === 'undefined') return
    window.clearTimeout(this.timer)
    this.timer = null
  }

  private releaseAudio(): void {
    const audio = this.audio
    if (audio === null) return
    this.audio = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}
