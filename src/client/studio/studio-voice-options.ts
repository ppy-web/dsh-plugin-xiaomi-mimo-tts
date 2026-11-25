import { BREEZE_VOICE_PRESETS, DOUBAO_VOICE_PRESETS, TTS_VOICE_DESIGN_PRESETS, breezeVoiceLabel } from '../../shared.js'
import type { ResolvedTtsSettings, StudioRole } from '../../shared.js'
import type { VoiceIdHistoryKind } from '../settings/voice-id-history.js'

export const CUSTOM_VOICE_DESIGN_OPTION = '__studio_custom_voice_design__'

export interface StudioVoiceIdBucket {
  history: readonly string[]
  names: Record<string, string>
}

export type StudioVoiceIdLibrary = Record<VoiceIdHistoryKind, StudioVoiceIdBucket>

export interface StudioVoiceChoice {
  id: string
  label: string
  custom?: boolean
}

export interface StudioVoiceDesignChoice {
  id: string
  label: string
  prompt: string
}

export type StudioRoleSettingsSlice = Pick<
  ResolvedTtsSettings,
  'doubaoVoice' | 'doubaoClonedVoice' | 'breezeVoice' | 'mossVoice' | 'mossVoiceName' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt'
>

const DOUBAO_PRESET_IDS = new Set<string>(DOUBAO_VOICE_PRESETS.map(item => item.value))
const BREEZE_PRESET_IDS = new Set<string>(BREEZE_VOICE_PRESETS.map(item => item.value))

export function findVoiceDesignPresetByPrompt(prompt?: string): typeof TTS_VOICE_DESIGN_PRESETS[number] | undefined {
  const trimmed = prompt?.trim()
  if (!trimmed) return undefined
  return TTS_VOICE_DESIGN_PRESETS.find(item => item.prompt.trim() === trimmed)
}

export function buildXiaomiVoiceDesignChoices(): StudioVoiceDesignChoice[] {
  return TTS_VOICE_DESIGN_PRESETS.map(preset => ({
    id: preset.id,
    label: `${preset.label} · ${preset.summary}`,
    prompt: preset.prompt,
  }))
}

function formatCustomVoiceLabel(id: string, names: Record<string, string>): string {
  const remark = Object.hasOwn(names, id) ? names[id]?.trim() : ''
  return remark ? `${remark} · ${id}` : id
}

function collectUniqueIds(sources: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of sources) {
    const id = raw?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function buildDoubaoClonedVoiceChoices(
  library: StudioVoiceIdLibrary,
  settings: Pick<StudioRoleSettingsSlice, 'doubaoClonedVoice'>,
  roles: readonly StudioRole[],
): StudioVoiceChoice[] {
  const ids = collectUniqueIds([
    ...library.cloned.history,
    settings.doubaoClonedVoice,
    ...roles
      .filter(role => role.provider === 'doubao' && role.model === 'seed-icl-2.0')
      .map(role => role.voice),
  ])
  return ids.map(id => ({
    id,
    label: formatCustomVoiceLabel(id, library.cloned.names),
    custom: true,
  }))
}

export function buildDoubaoStandardCustomVoiceChoices(
  library: StudioVoiceIdLibrary,
  settings: Pick<StudioRoleSettingsSlice, 'doubaoVoice'>,
  roles: readonly StudioRole[],
): StudioVoiceChoice[] {
  const settingsCustom = settings.doubaoVoice.trim() && !DOUBAO_PRESET_IDS.has(settings.doubaoVoice.trim())
    ? settings.doubaoVoice
    : undefined
  const roleCustom = roles
    .filter(role => role.provider === 'doubao' && role.model === 'seed-tts-2.0' && !DOUBAO_PRESET_IDS.has(role.voice.trim()))
    .map(role => role.voice)
  const ids = collectUniqueIds([
    ...library.standard.history,
    settingsCustom,
    ...roleCustom,
  ])
  return ids.map(id => ({
    id,
    label: formatCustomVoiceLabel(id, library.standard.names),
    custom: true,
  }))
}

export function buildDoubaoStandardPresetChoices(library: StudioVoiceIdLibrary): StudioVoiceChoice[] {
  return DOUBAO_VOICE_PRESETS.map(preset => {
    const remark = Object.hasOwn(library.standard.names, preset.value)
      ? library.standard.names[preset.value]?.trim()
      : ''
    return {
      id: preset.value,
      label: remark ? `${remark} · ${preset.scene}` : `${preset.name} · ${preset.scene}`,
    }
  })
}

export function buildBreezeCustomVoiceChoices(
  library: StudioVoiceIdLibrary,
  settings: Pick<StudioRoleSettingsSlice, 'breezeVoice'>,
  roles: readonly StudioRole[],
): StudioVoiceChoice[] {
  const settingsCustom = settings.breezeVoice.trim() && !BREEZE_PRESET_IDS.has(settings.breezeVoice.trim())
    ? settings.breezeVoice
    : undefined
  const roleCustom = roles
    .filter(role => role.provider === 'breeze' && !BREEZE_PRESET_IDS.has(role.voice.trim()))
    .map(role => role.voice)
  const ids = collectUniqueIds([
    ...library.breeze.history,
    settingsCustom,
    ...roleCustom,
  ])
  return ids.map(id => ({
    id,
    label: formatCustomVoiceLabel(id, library.breeze.names),
    custom: true,
  }))
}

export function buildBreezePresetChoices(library: StudioVoiceIdLibrary): StudioVoiceChoice[] {
  return BREEZE_VOICE_PRESETS.map(preset => {
    const remark = Object.hasOwn(library.breeze.names, preset.value)
      ? library.breeze.names[preset.value]?.trim()
      : ''
    return {
      id: preset.value,
      label: remark || preset.name,
    }
  })
}

export function isBuiltinDoubaoVoice(id: string): boolean {
  return DOUBAO_PRESET_IDS.has(id.trim())
}

export function isBuiltinBreezeVoice(id: string): boolean {
  return BREEZE_PRESET_IDS.has(id.trim())
}

export function resolveStudioRoleVoiceLabel(role: StudioRole, library?: StudioVoiceIdLibrary): string {
  if (role.provider === 'xiaomi' && role.model === 'mimo-v2.5-tts-voicedesign') {
    return findVoiceDesignPresetByPrompt(role.voiceDesignPrompt)?.label ?? '音色设计'
  }
  if (role.provider === 'doubao') {
    const kind: VoiceIdHistoryKind = role.model === 'seed-icl-2.0' ? 'cloned' : 'standard'
    const remark = library?.[kind]?.names && Object.hasOwn(library[kind].names, role.voice)
      ? library[kind].names[role.voice]?.trim()
      : ''
    if (remark) return remark
    const preset = DOUBAO_VOICE_PRESETS.find(v => v.value === role.voice)
    if (preset) return preset.name
  }
  if (role.provider === 'breeze') {
    const remark = library?.breeze?.names && Object.hasOwn(library.breeze.names, role.voice)
      ? library.breeze.names[role.voice]?.trim()
      : ''
    if (remark) return remark
    return breezeVoiceLabel(role.voice)
  }
  return role.voice || role.model
}
