import { createUISFX, getCue } from './runtime.js'
import type { SoundEffectsController, SoundEffectsPlayOptions, SoundEffectsSettings, SoundCue } from './types.js'
import { classifyClick } from './click-classifier.js'
import { DEFAULT_SOUND_SETTINGS } from '../../types/sound.js'
import type { Context } from '@deepseek-ai/cordis'

const VALID_CUES = new Set<SoundCue>(['hover', 'start', 'complete', 'success', 'error', 'notification', 'press', 'select', 'toggle-on', 'toggle-off', 'send', 'close', 'delete', 'open', 'stop', 'queued', 'processing'])
const BACKGROUND_TASK_CUES = new Set<SoundCue>(['start', 'complete', 'error', 'stop', 'queued', 'processing'])

function createSoundAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return undefined
  try {
    return new AudioContextConstructor({ latencyHint: 'interactive' })
  } catch {
    return undefined
  }
}

export function createSoundEffectsController(canPlay: () => boolean = () => true, canPlayMicrophoneCue = canPlay): SoundEffectsController {
  let settings: SoundEffectsSettings = { enabled: true, volume: DEFAULT_SOUND_SETTINGS.soundVolume, pack: DEFAULT_SOUND_SETTINGS.soundPack, taskSounds: true, clickSounds: true }
  let player: ReturnType<typeof createUISFX> | null = null
  let ownedContext: AudioContext | undefined
  const desiredLoops = new Set<SoundCue>()
  const activeLoops = new Map<SoundCue, { stop(): void }>()

  const getPlayer = (): ReturnType<typeof createUISFX> => {
    if (player === null) {
      ownedContext ??= createSoundAudioContext()
      player = createUISFX({
        pack: settings.pack,
        volume: settings.volume,
        enabled: settings.enabled,
        maxVoices: 8,
        ...(ownedContext ? { context: ownedContext } : {}),
      })
    }
    return player
  }
  const canPlayLoop = (cue: SoundCue): boolean => {
    if (!settings.enabled || !canPlay()) return false
    if (BACKGROUND_TASK_CUES.has(cue) && !settings.taskSounds) return false
    return true
  }
  const stopLoopHandle = (cue: SoundCue): void => {
    const handle = activeLoops.get(cue)
    if (!handle) return
    activeLoops.delete(cue)
    try { handle.stop() } catch { /* AudioContext may already be closed. */ }
  }
  const syncLoops = (): void => {
    for (const cue of [...activeLoops.keys()]) {
      if (!desiredLoops.has(cue) || !canPlayLoop(cue)) stopLoopHandle(cue)
    }
    for (const cue of desiredLoops) {
      if (activeLoops.has(cue) || !canPlayLoop(cue) || !VALID_CUES.has(cue)) continue
      try {
        const target = getPlayer()
        if (ownedContext?.state === 'suspended') {
          void ownedContext.resume().then(() => {
            if (ownedContext?.state === 'running') syncLoops()
          }).catch(() => {})
          continue
        }
        const handle = target.play(cue, { loop: true, retrigger: 'ignore' })
        if (handle && typeof handle.stop === 'function') activeLoops.set(cue, { stop: () => handle.stop() })
      } catch { /* AudioContext may be unavailable. */ }
    }
  }
  const play = (cue: SoundCue, options?: SoundEffectsPlayOptions, interactive = false): void => {
    if (!settings.enabled || !VALID_CUES.has(cue)) return
    try {
      const target = getPlayer()
      if (!interactive && BACKGROUND_TASK_CUES.has(cue) && ownedContext?.state === 'suspended') {
        void ownedContext.resume().catch(() => {})
        return
      }
      target.play(cue, options)
      if (desiredLoops.size > 0 && ownedContext?.state === 'running') syncLoops()
    } catch { /* AudioContext may be unavailable. */ }
  }

  return {
    play(cue, options) {
      if (canPlay()) play(cue, options, false)
    },
    playMicrophoneCue(recording) {
      if (settings.clickSounds && canPlayMicrophoneCue()) play(recording ? 'toggle-on' : 'toggle-off', undefined, true)
    },
    preview(cue) {
      if (canPlay()) play(cue, undefined, true)
    },
    setLoop(cue, active) {
      if (!VALID_CUES.has(cue)) return
      if (active) desiredLoops.add(cue)
      else desiredLoops.delete(cue)
      syncLoops()
    },
    setVolume(value) {
      settings = { ...settings, volume: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : settings.volume }
      if (player !== null) player.setVolume(settings.volume)
    },
    previewVolume(voiceVolume) {
      if (!canPlay() || !settings.enabled) return
      const volume = voiceVolume === undefined ? undefined : getCue('check').defaultVolume * Math.max(0, Math.min(1, voiceVolume))
      try {
        getPlayer().play('check', volume === undefined ? { retrigger: 'ignore' } : { volume, retrigger: 'restart' })
      } catch { /* Preview is best effort. */ }
    },
    update(next) {
      const previous = settings
      settings = next
      if (player !== null) {
        if (previous.enabled !== next.enabled) player.setEnabled(next.enabled)
        if (previous.volume !== next.volume) player.setVolume(next.volume)
        if (previous.pack !== next.pack) player.setPack(next.pack)
      }
      syncLoops()
    },
    async dispose() {
      desiredLoops.clear()
      for (const cue of [...activeLoops.keys()]) stopLoopHandle(cue)
      const current = player
      const context = ownedContext
      player = null
      ownedContext = undefined
      if (current !== null) await current.destroy()
      if (context && context.state !== 'closed') {
        try { await context.close() } catch { /* Best-effort AudioContext cleanup. */ }
      }
    },
  }
}

export function installClickSounds(_ctx: Context, controller: SoundEffectsController, getSettings: () => SoundEffectsSettings): () => void {
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
  const onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    const settings = getSettings()
    if (!settings.enabled || !settings.clickSounds) return
    if (!(event.target instanceof Element)) return
    const current = event.target.closest('[data-xmimo-hover-sound]')
    if (current === null) return
    const previous = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-xmimo-hover-sound]') : null
    if (current === previous) return
    controller.play('hover')
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerover', onPointerOver, true)
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointerover', onPointerOver, true)
  }
}

export type { SoundEffectsController, SoundEffectsSettings, SoundCue } from './types.js'
