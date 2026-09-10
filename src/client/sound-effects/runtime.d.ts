export interface UisfxPlayer {
  play(cue: string, options?: { volume?: number; cooldownMs?: number; retrigger?: 'ignore' | 'restart' | 'overlap' }): unknown
  unlock(): Promise<boolean>
  setPack(pack: string): void
  setVolume(volume: number): void
  setEnabled(enabled: boolean): void
  stopAll(): void
  destroy(): Promise<void>
}

export const cueNames: readonly string[]
export const packNames: readonly string[]
export function createUISFX(options?: { pack?: string; volume?: number; enabled?: boolean; maxVoices?: number; preferences?: { key?: string } }): UisfxPlayer
