import type { SoundPack } from '../shared.js'

export type SoundCue = 'hover' | 'start' | 'complete' | 'success' | 'error' | 'notification' | 'press' | 'select' | 'toggle-on' | 'toggle-off' | 'send' | 'close' | 'delete' | 'open' | 'stop' | 'queued' | 'processing'

export interface SoundEffectsSettings {
  enabled: boolean
  volume: number
  pack: SoundPack
  taskSounds: boolean
  clickSounds: boolean
}

export interface SoundEffectsPlayOptions {
  playbackRate?: number
}

export interface SoundEffectsController {
  play(cue: SoundCue, options?: SoundEffectsPlayOptions): void
  playMicrophoneCue(recording: boolean): void
  preview(cue: SoundCue): void
  setLoop?(cue: SoundCue, active: boolean): void
  setVolume(value: number): void
  previewVolume(voiceVolume?: number): void
  update(settings: SoundEffectsSettings): void
  dispose(): Promise<void>
}
