import { createUISFX } from './runtime.js'
import type { SoundEffectsController, SoundEffectsSettings, SoundCue } from './types.js'
import { classifyClick } from './click-classifier.js'
import type { Context } from '@deepseek-ai/cordis'

const VALID_CUES = new Set<SoundCue>(['start', 'complete', 'success', 'error', 'notification', 'press', 'select', 'toggle-on', 'toggle-off', 'send', 'close', 'delete', 'open', 'stop', 'queued'])

export function createSoundEffectsController(): SoundEffectsController {
  let settings: SoundEffectsSettings = { enabled: true, volume: 0.35, pack: 'zen', taskSounds: true, clickSounds: true }
  let player: ReturnType<typeof createUISFX> | null = null

  const getPlayer = (): ReturnType<typeof createUISFX> => {
    if (player === null) player = createUISFX({ pack: settings.pack, volume: settings.volume, enabled: settings.enabled, maxVoices: 8, preferences: { key: 'xiaomi-mimo-tts:sound-effects' } })
    return player
  }

  return {
    play(cue, options) {
      if (!settings.enabled || !VALID_CUES.has(cue)) return
      try { getPlayer().play(cue, options) } catch { /* AudioContext may be unavailable. */ }
    },
    preview(cue) {
      if (!settings.enabled || !VALID_CUES.has(cue)) return
      try { getPlayer().play(cue) } catch { /* Preview is best effort. */ }
    },
    setVolume(value) {
      settings = { ...settings, volume: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : settings.volume }
      if (player !== null) player.setVolume(settings.volume)
    },
    previewVolume() {
      if (!settings.enabled) return
      try { getPlayer().play('check', { retrigger: 'ignore' }) } catch { /* Preview is best effort. */ }
    },
    update(next) {
      settings = next
      if (player === null) return
      player.setEnabled(next.enabled)
      player.setVolume(next.volume)
      player.setPack(next.pack)
    },
    async dispose() {
      const current = player
      player = null
      if (current !== null) await current.destroy()
    },
  }
}

export function installClickSounds(ctx: Context, controller: SoundEffectsController, getSettings: () => SoundEffectsSettings): () => void {
  let lastClickAt = 0
  const onPointerDown = (event: PointerEvent): void => {
    const settings = getSettings()
    if (!settings.enabled || !settings.clickSounds) return
    const cue = classifyClick(event.target)
    if (cue === null) return
    const now = Date.now()
    if (now - lastClickAt < 40) return
    lastClickAt = now
    controller.play(cue)
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => document.removeEventListener('pointerdown', onPointerDown, true)
}

export type { SoundEffectsController, SoundEffectsSettings, SoundCue } from './types.js'
