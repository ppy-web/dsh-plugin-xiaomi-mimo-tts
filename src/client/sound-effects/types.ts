import type { SoundPack } from '../../shared.js'

export type SoundCue = 'start' | 'complete' | 'success' | 'error' | 'notification' | 'press' | 'select' | 'toggle-on' | 'send' | 'close' | 'delete' | 'open'

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
  update(settings: SoundEffectsSettings): void
  dispose(): Promise<void>
}
