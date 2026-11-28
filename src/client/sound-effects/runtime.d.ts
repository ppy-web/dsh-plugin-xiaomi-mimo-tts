export interface UisfxPlayback {
  stop(): void
  ended: Promise<void>
}

export interface UisfxPlayer {
  play(cue: string, options?: { volume?: number; cooldownMs?: number; playbackRate?: number; loop?: boolean; retrigger?: 'ignore' | 'restart' | 'overlap' }): UisfxPlayback | null
  unlock(): Promise<boolean>
  setPack(pack: string): void
  setVolume(volume: number): void
  setEnabled(enabled: boolean): void
  stopAll(): void
  destroy(): Promise<void>
}

export const cueNames: readonly string[]
export const packNames: readonly string[]
export function getCue(cue: string): { defaultVolume: number }
export function createUISFX(options?: { pack?: string; volume?: number; enabled?: boolean; maxVoices?: number; preferences?: { key?: string } }): UisfxPlayer
