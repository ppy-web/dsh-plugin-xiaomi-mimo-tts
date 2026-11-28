import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OPTIONAL_TTS_PROVIDERS, TTS_PROVIDER_SWITCH } from '../../types/providers.js'
import { DEFAULT_TTS_SETTINGS, isSupportedTtsApiKey } from '../../types/settings.js'
import type { TtsSettings } from '../../types/settings.js'
import { resolveTtsSettings } from '../../utils/settings.js'
import type { DraftChanges, SettingsValues, EditableSettingField } from './types.js'
import { settingsValueEqual } from './scope.js'

export const EDITABLE_SETTING_FIELDS: readonly EditableSettingField[] = ['showInSidebar', 'showInHostSettings', 'showFeatureGuide', 'acceptExternalProviders', 'avoidHostReadAloud', 'voiceRecognitionService', 'qqbotEnabled', 'announcementSources', 'provider', 'doubaoModel', 'doubaoVoice', 'doubaoClonedVoice', 'doubaoInstruction', 'doubaoEnabled', 'deepseekEnabled', 'deepseekVoice', 'breezeEnabled', 'breezeVoice', 'breezeInstruction', 'instruction', 'enabled', 'autoPlay', 'showReadingCaptions', 'showAudioResponse', 'showCustomPortraits', 'showAvatarStyle', 'audioResponseStyle', 'importantAnnouncementsFirst', 'voiceVolume', 'voiceRate', 'readScope', 'avatarStyle', 'model', 'localSpeechMode', 'localVoiceURI', 'localVoiceEngine', 'mossEnabled', 'mossBaseURL', 'mossVoice', 'mossVoiceName', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'soundEnabled', 'soundVolume', 'soundPack', 'taskSounds', 'clickSounds']

const PROVIDER_KEY_FIELDS = [['xiaomi', 'apiKey'], ['doubao', 'doubaoApiKey'], ['breeze', 'breezeApiKey'], ['deepseek', 'deepseekApiKey']] as const

export type SaveSettingsErrorCode = 'voice-required' | 'api-key-rejected' | 'host-rejected' | 'provider-count'

export const BUILTIN_SETTING_FIELDS = new Set<string>(['provider', 'apiKey', 'doubaoEnabled', 'doubaoApiKey', 'doubaoModel', 'doubaoVoice', 'doubaoClonedVoice', 'doubaoInstruction', 'deepseekEnabled', 'deepseekApiKey', 'deepseekVoice', 'breezeEnabled', 'breezeApiKey', 'breezeVoice', 'breezeInstruction', 'instruction', 'model', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt'])

/** A failed draft write with a stable code, so the settings card never matches messages. */
export class SaveSettingsError extends Error {
  constructor(readonly code: SaveSettingsErrorCode) {
    super(code)
    this.name = 'SaveSettingsError'
  }
}

export function validateSettingsDraft(draft: SettingsValues): 'voice-required' | null {
  return draft.provider === 'doubao' && !(draft.doubaoModel === 'seed-icl-2.0' ? draft.doubaoClonedVoice : draft.doubaoVoice).trim()
    ? 'voice-required' : null
}

/** Commit the draft atomically so credentials and provider selection change together. */
export async function saveSettingsDraft(scope: ConfigForm<TtsSettings>, draft: SettingsValues, changes: DraftChanges, keys: { xiaomi: string; doubao: string; breeze: string; deepseek?: string }, external = false, openApiToken = ''): Promise<void> {
  if (external) changes = Object.fromEntries(Object.entries(changes).filter(([field]) => !BUILTIN_SETTING_FIELDS.has(field)))
  const invalid = external ? null : validateSettingsDraft(draft)
  if (invalid) throw new SaveSettingsError(invalid)
  for (const [provider, field] of PROVIDER_KEY_FIELDS) {
    if (changes[field]?.kind === 'set' && (keys[provider] ?? '').trim() && !isSupportedTtsApiKey(keys[provider] ?? '', provider)) throw new SaveSettingsError('api-key-rejected')
  }
  const snapshot = scope.getSnapshot()
  const acceptedValues = resolveTtsSettings(snapshot.value)
  const base = snapshot.base as TtsSettings | undefined
  const switchFields = OPTIONAL_TTS_PROVIDERS.map(provider => TTS_PROVIDER_SWITCH[provider])
  const switchesChanged = switchFields.some(field => changes[field] !== undefined)
  const selected = changes.provider?.kind === 'set' ? draft.provider : acceptedValues.provider
  const available = switchFields.filter(field => {
    const change = changes[field]
    if (change?.kind === 'set') return draft[field]
    if (change?.kind === 'clear') return base?.[field] ?? DEFAULT_TTS_SETTINGS[field]
    return acceptedValues[field]
  })
  if (switchesChanged && (available.length < 1 || available.length > 2)) throw new SaveSettingsError('provider-count')
  if (changes.provider?.kind === 'set' && selected !== 'xiaomi' && !available.includes(TTS_PROVIDER_SWITCH[selected])) throw new SaveSettingsError('host-rejected')
  const overridden = (field: string) => snapshot.user !== null && typeof snapshot.user === 'object' && Object.hasOwn(snapshot.user, field)
  const ops: Parameters<ConfigForm<TtsSettings>['mutate']>[0][number][] = []
  const write = (field: EditableSettingField, value: SettingsValues[EditableSettingField]): void => {
    const change = changes[field]
    if (!change) return
    const accepted = snapshot.value?.[field] ?? acceptedValues[field]
    if (change.kind === 'set' && settingsValueEqual(accepted, value)) return
    if (change.kind === 'clear' && !overridden(field)) return
    ops.push(change.kind === 'clear' ? { op: 'unset', path: [field] } : { op: 'set', path: [field], value })
  }
  for (const field of EDITABLE_SETTING_FIELDS) {
    if (field !== 'provider') write(field, draft[field])
  }
  // Fix excess or missing saved switches when saving a new provider selection.
  if (switchesChanged || changes.provider) {
    for (const field of switchFields) {
      const raw = snapshot.value?.[field] ?? DEFAULT_TTS_SETTINGS[field]
      if (!changes[field] && raw !== acceptedValues[field]) ops.push({ op: 'set', path: [field], value: acceptedValues[field] })
    }
  }
  for (const [provider, field] of PROVIDER_KEY_FIELDS) {
    if (changes[field]?.kind === 'set' && (keys[provider] ?? '').trim()) {
      ops.push({ op: 'set', path: [field], value: (keys[provider] ?? '').trim() })
    }
  }
  if (changes.openApiToken?.kind === 'set' && openApiToken.trim()) {
    ops.push({ op: 'set', path: ['openApiToken'], value: openApiToken.trim() })
  } else if (changes.openApiToken?.kind === 'clear') {
    ops.push({ op: 'set', path: ['openApiToken'], value: '' })
  }
  write('provider', draft.provider)
  if (switchesChanged && !changes.provider && selected !== 'xiaomi' && !available.includes(TTS_PROVIDER_SWITCH[selected])) {
    ops.push({ op: 'set', path: ['provider'], value: 'xiaomi' })
  }
  if (ops.length && !await scope.mutate(ops, snapshot.revision)) throw new SaveSettingsError('host-rejected')
}
