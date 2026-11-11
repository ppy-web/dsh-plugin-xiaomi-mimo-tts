/**
 * Voice reading page options — pure provider/model → editable voice source
 * resolution plus the immediate write operations the page sends.
 *
 * No React and no browser APIs here: the module is transpiled directly by the
 * unit tests, so it only depends on shared preset data and the locale key type.
 */

import { BREEZE_VOICE_PRESETS, DOUBAO_VOICE_PRESETS, TTS_VOICE_DESIGN_PRESETS, TTS_VOICE_PRESETS, ttsSelection } from '../../shared.js'
import type { ResolvedTtsSettings, TtsReadScope } from '../../shared.js'
import type { LocaleKey } from '../localization.js'
import type { VoiceIdHistoryKind } from './voice-id-history.js'
import type { ApiKeyStatus } from './api-key-state.js'

/** Report the first incomplete setting, including cloud credentials when local speech works. */
export function voiceReadingWarningKey(settings: ResolvedTtsSettings, apiKeyStatus: ApiKeyStatus): LocaleKey | null {
  if (!settings.enabled) return 'settings.voiceReadingWarningDisabled'
  if (apiKeyStatus === 'missing') return 'settings.voiceReadingWarningApiKeyMissing'
  if (apiKeyStatus === 'unrecognized') return 'settings.voiceReadingWarningApiKeyInvalid'
  if (apiKeyStatus === 'unavailable') return 'settings.voiceReadingWarningApiKeyUnavailable'
  if (!ttsSelection(settings).voice.trim()) return 'settings.voiceReadingWarningVoiceRequired'
  return null
}

export type VoiceReadingField = 'voice' | 'voiceDesignPrompt' | 'doubaoVoice' | 'doubaoClonedVoice' | 'breezeVoice'

export interface VoiceReadingChoice {
  value: string
  label: string
  detail?: string
  /** Stable preset ID when the selection value is a description. */
  avatarId?: string
}

export type VoiceReadingWriteOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] }

export interface VoiceReadingVoiceSource {
  field: VoiceReadingField
  value: string
  choices: readonly VoiceReadingChoice[]
  hintKey: LocaleKey
}

const DOUBAO_CLONED_MODEL = 'seed-icl-2.0'
const XIAOMI_VOICE_DESIGN_MODEL = 'mimo-v2.5-tts-voicedesign'

export type VoiceIdLibrary = Partial<Record<VoiceIdHistoryKind, { history: readonly string[]; names: Record<string, string> }>>

function voiceChoices(presets: readonly VoiceReadingChoice[], current: string, library: VoiceIdLibrary, kind: VoiceIdHistoryKind): VoiceReadingChoice[] {
  const saved = library[kind]
  const choices = new Map(presets.map(choice => [choice.value, choice]))
  for (const id of [current, ...saved?.history ?? []]) {
    if (id.trim() && !choices.has(id)) choices.set(id, { value: id, label: id })
  }
  return [...choices.values()].map(choice => {
    const remark = saved?.names && Object.hasOwn(saved.names, choice.value) ? saved.names[choice.value]?.trim() : ''
    return remark ? { value: choice.value, label: remark } : choice
  })
}

export function buildVoiceReadingVoiceSource(
  settings: ResolvedTtsSettings,
  clonedVoiceHistory: readonly string[] = [],
  library: VoiceIdLibrary = {},
): VoiceReadingVoiceSource {
  if (settings.provider === 'breeze') return {
    field: 'breezeVoice',
    value: settings.breezeVoice,
    choices: voiceChoices(BREEZE_VOICE_PRESETS.map(voice => ({ value: voice.value, label: voice.name })), settings.breezeVoice, library, 'breeze'),
    hintKey: 'settings.voiceReadingHintBreeze',
  }
  if (settings.provider === 'doubao') {
    if (settings.doubaoModel === DOUBAO_CLONED_MODEL) {
      return {
        field: 'doubaoClonedVoice',
        value: settings.doubaoClonedVoice,
        choices: voiceChoices([], settings.doubaoClonedVoice, { cloned: { history: clonedVoiceHistory, names: {}, ...library.cloned } }, 'cloned'),
        hintKey: 'settings.voiceReadingHintDoubaoCloned',
      }
    }
    return {
      field: 'doubaoVoice',
      value: settings.doubaoVoice,
      choices: voiceChoices(DOUBAO_VOICE_PRESETS.map((voice) => ({ value: voice.value, label: voice.name, detail: voice.scene })), settings.doubaoVoice, library, 'standard'),
      hintKey: 'settings.voiceReadingHintDoubaoStandard',
    }
  }
  if (settings.model === XIAOMI_VOICE_DESIGN_MODEL) {
    return {
      field: 'voiceDesignPrompt',
      value: settings.voiceDesignPrompt,
      choices: TTS_VOICE_DESIGN_PRESETS.map((preset) => ({ value: preset.prompt, label: preset.label, detail: preset.summary, avatarId: preset.id })),
      hintKey: 'settings.voiceReadingHintVoiceDesign',
    }
  }
  return {
    field: 'voice',
    value: settings.voice,
    choices: TTS_VOICE_PRESETS.map((preset) => ({ value: preset.value, label: preset.value, detail: preset.summary })),
    hintKey: 'settings.voiceReadingHintXiaomi',
  }
}

export function voiceChoiceWriteOps(source: VoiceReadingVoiceSource, value: string): VoiceReadingWriteOp[] {
  const ops: VoiceReadingWriteOp[] = [{ op: 'set', path: [source.field], value }]
  if (source.field === 'voiceDesignPrompt') {
    ops.push({ op: 'set', path: ['voiceDesignCustomPrompt'], value })
  }
  return ops
}

export function autoPlayWriteOps(next: boolean, current: ResolvedTtsSettings): VoiceReadingWriteOp[] {
  if (!next) {
    return [{ op: 'set', path: ['autoPlay'], value: false }]
  }
  const ops: VoiceReadingWriteOp[] = []
  // Resolved settings force autoPlay off while voice reading is disabled, so
  // turning auto-play on has to turn reading on first (same coupling as the
  // existing settings card).
  if (!current.enabled) {
    ops.push({ op: 'set', path: ['enabled'], value: true })
  }
  ops.push({ op: 'set', path: ['autoPlay'], value: true })
  return ops
}

const READ_SCOPE_LABELS: Record<TtsReadScope, LocaleKey> = {
  smart: 'settings.readScopeSmart',
  full: 'settings.readScopeFull',
  concise: 'settings.readScopeConcise',
}

const READ_SCOPE_HINTS: Record<TtsReadScope, LocaleKey> = {
  smart: 'settings.readScopeSmartHint',
  full: 'settings.readScopeFullHint',
  concise: 'settings.readScopeConciseHint',
}

/** Localized label for one read-aloud range option. */
export function readScopeLabelKey(scope: TtsReadScope): LocaleKey {
  return READ_SCOPE_LABELS[scope]
}

/** Localized description of the selected read-aloud range. */
export function readScopeHintKey(scope: TtsReadScope): LocaleKey {
  return READ_SCOPE_HINTS[scope]
}

export function readScopeWriteOps(scope: TtsReadScope): VoiceReadingWriteOp[] {
  return [{ op: 'set', path: ['readScope'], value: scope }]
}

/** Volume steps offered by the page (0 %–100 % in 20-point steps). */
export const VOICE_VOLUME_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const

/** Playback speeds offered by the page. */
export const VOICE_RATE_STEPS = [0.5, 0.8, 1, 1.2, 1.5, 1.8] as const

/** `0.8` → `80%`, the same reading the settings card shows. */
export function formatVoiceVolume(volume: number): string {
  return `${Math.round(volume * 100)}%`
}

/** `1.2` → `1.2×`, the same reading the settings card shows. */
export function formatVoiceRate(rate: number): string {
  return `${rate.toFixed(1)}×`
}

export function volumeWriteOps(volume: number): VoiceReadingWriteOp[] {
  return [{ op: 'set', path: ['voiceVolume'], value: volume }]
}

export function rateWriteOps(rate: number): VoiceReadingWriteOp[] {
  return [{ op: 'set', path: ['voiceRate'], value: rate }]
}

export function soundWriteOps(next: boolean, current: ResolvedTtsSettings): VoiceReadingWriteOp[] {
  if (!next) {
    return [{ op: 'set', path: ['soundEnabled'], value: false }]
  }
  const ops: VoiceReadingWriteOp[] = [{ op: 'set', path: ['soundEnabled'], value: true }]
  // Keep an existing narrower scope (only task sounds or only click sounds);
  // only widen to both when the current scope would be silent.
  if (!current.taskSounds && !current.clickSounds) {
    ops.push(
      { op: 'set', path: ['taskSounds'], value: true },
      { op: 'set', path: ['clickSounds'], value: true },
    )
  }
  return ops
}
