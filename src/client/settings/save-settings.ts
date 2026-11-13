import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { isSupportedTtsApiKey } from '../../types/settings.js'
import type { TtsSettings } from '../../types/settings.js'
import { resolveTtsSettings } from '../../utils/settings.js'
import type { DraftChanges, SettingsValues, EditableSettingField } from './types.js'

export const EDITABLE_SETTING_FIELDS: readonly EditableSettingField[] = ['showInSidebar', 'showInHostSettings', 'showFeatureGuide', 'acceptExternalProviders', 'voiceRecognitionService', 'qqbotEnabled', 'announcementSources', 'provider', 'doubaoModel', 'doubaoVoice', 'doubaoClonedVoice', 'doubaoInstruction', 'doubaoEnabled', 'breezeEnabled', 'breezeVoice', 'breezeInstruction', 'instruction', 'enabled', 'autoPlay', 'showReadingCaptions', 'voiceInputCompatibility', 'inputAvoidance', 'importantAnnouncementsFirst', 'voiceVolume', 'voiceRate', 'readScope', 'model', 'localSpeechMode', 'localVoiceURI', 'localVoiceEngine', 'mossEnabled', 'mossBaseURL', 'mossVoice', 'mossVoiceName', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'soundEnabled', 'soundVolume', 'soundPack', 'taskSounds', 'clickSounds']

export type SaveSettingsErrorCode = 'voice-required' | 'api-key-rejected' | 'host-rejected'

export const BUILTIN_SETTING_FIELDS = new Set<string>(['provider', 'apiKey', 'doubaoEnabled', 'doubaoApiKey', 'doubaoModel', 'doubaoVoice', 'doubaoClonedVoice', 'doubaoInstruction', 'breezeEnabled', 'breezeApiKey', 'breezeVoice', 'breezeInstruction', 'instruction', 'model', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt'])

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
export async function saveSettingsDraft(scope: ConfigForm<TtsSettings>, draft: SettingsValues, changes: DraftChanges, keys: { xiaomi: string; doubao: string; breeze: string }, external = false): Promise<void> {
  if (external) changes = Object.fromEntries(Object.entries(changes).filter(([field]) => !BUILTIN_SETTING_FIELDS.has(field)))
  const invalid = external ? null : validateSettingsDraft(draft)
  if (invalid) throw new SaveSettingsError(invalid)
  for (const [provider, field] of [['xiaomi', 'apiKey'], ['doubao', 'doubaoApiKey'], ['breeze', 'breezeApiKey']] as const) {
    if (changes[field]?.kind === 'set' && keys[provider].trim() && !isSupportedTtsApiKey(keys[provider], provider)) throw new SaveSettingsError('api-key-rejected')
  }
  const snapshot = scope.getSnapshot()
  const acceptedValues = resolveTtsSettings(snapshot.value)
  const overridden = (field: string) => snapshot.user !== null && typeof snapshot.user === 'object' && Object.hasOwn(snapshot.user, field)
  const ops: Parameters<ConfigForm<TtsSettings>['mutate']>[0][number][] = []
  const write = (field: EditableSettingField, value: SettingsValues[EditableSettingField]): void => {
    const change = changes[field]
    if (!change) return
    if (change.kind === 'set' && (Array.isArray(value) ? JSON.stringify(acceptedValues[field]) === JSON.stringify(value) : Object.is(acceptedValues[field], value))) return
    if (change.kind === 'clear' && !overridden(field)) return
    ops.push(change.kind === 'clear' ? { op: 'unset', path: [field] } : { op: 'set', path: [field], value })
  }
  for (const field of EDITABLE_SETTING_FIELDS) {
    if (field !== 'provider') write(field, draft[field])
  }
  for (const [provider, field] of [['xiaomi', 'apiKey'], ['doubao', 'doubaoApiKey'], ['breeze', 'breezeApiKey']] as const) {
    if (changes[field]?.kind === 'set' && keys[provider].trim()) {
      ops.push({ op: 'set', path: [field], value: keys[provider].trim() })
    }
  }
  write('provider', draft.provider)
  if (ops.length && !await scope.mutate(ops)) throw new SaveSettingsError('host-rejected')
}
