import {
  TTS_TOGGLE_AUDIO_ASSET_ROUTE,
  TTS_TOGGLE_SOUND_FILES,
  TTS_VOLUME_PREVIEW_FILES,
} from '../../shared.js'
import type { TtsToggleSoundKind } from '../../shared.js'
import { hostRoute } from '../host-route.js'

export const TOGGLE_SOUND_DEBOUNCE_MS = 200

export class ToggleSoundPlayer {
  private timer: number | null = null
  private audio: HTMLAudioElement | null = null
  private volumePreviewAudio: HTMLAudioElement | null = null
  private volume = 1
  private volumePreviewIndex: number | null = null
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
    this.releaseVolumePreviewAudio()
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    if (this.audio !== null) this.audio.volume = this.volume
  }

  setPreviewVolume(value: number): void {
    const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    if (this.volumePreviewAudio !== null) this.volumePreviewAudio.volume = volume
  }

  previewVolume(value: number): void {
    const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    this.setPreviewVolume(volume)
    if (this.volumePreviewAudio !== null || typeof window === 'undefined') return

    let index = Math.floor(Math.random() * TTS_VOLUME_PREVIEW_FILES.length)
    if (TTS_VOLUME_PREVIEW_FILES.length > 1 && index === this.volumePreviewIndex) index = (index + 1) % TTS_VOLUME_PREVIEW_FILES.length
    this.volumePreviewIndex = index
    const audio = new Audio(hostRoute(`${TTS_TOGGLE_AUDIO_ASSET_ROUTE}/${TTS_VOLUME_PREVIEW_FILES[index]}`))
    this.volumePreviewAudio = audio
    audio.volume = volume
    audio.preload = 'auto'
    const release = (): void => {
      if (this.volumePreviewAudio !== audio) return
      audio.onended = null
      audio.onerror = null
      this.releaseVolumePreviewAudio()
    }
    audio.onended = release
    audio.onerror = release
    void audio.play().catch(release)
  }

  private play(kind: TtsToggleSoundKind): void {
    const files = TTS_TOGGLE_SOUND_FILES[kind]
    const previous = this.lastIndex.get(kind)
    let index = Math.floor(Math.random() * files.length)
    if (files.length > 1 && index === previous) index = (index + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length
    this.lastIndex.set(kind, index)

    const audio = new Audio(hostRoute(`${TTS_TOGGLE_AUDIO_ASSET_ROUTE}/${files[index]}`))
    this.audio = audio
    audio.volume = this.volume
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

  private releaseVolumePreviewAudio(): void {
    const audio = this.volumePreviewAudio
    if (audio === null) return
    this.volumePreviewAudio = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}
