import type { SoundPack } from '../../shared.js'

export type SoundCue = 'start' | 'complete' | 'success' | 'error' | 'notification' | 'press' | 'select' | 'toggle-on' | 'toggle-off' | 'send' | 'close' | 'delete' | 'open' | 'stop' | 'queued'

export interface SoundEffectsSettings {
  enabled: boolean
  volume: number
  pack: SoundPack
  taskSounds: boolean
  clickSounds: boolean
}

export interface SoundEffectsController {
  play(cue: SoundCue): void
  preview(cue: SoundCue): void
  setVolume(value: number): void
  previewVolume(): void
  update(settings: SoundEffectsSettings): void
  dispose(): Promise<void>
}
