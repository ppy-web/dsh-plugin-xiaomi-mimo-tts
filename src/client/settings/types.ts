export type EditableSettingField = 'enabled' | 'autoPlay' | 'voiceVolume' | 'voiceRate' | 'readScope' | 'model' | 'localSpeechMode' | 'localVoiceURI' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'soundEnabled' | 'soundVolume' | 'soundPack' | 'taskSounds' | 'clickSounds'
export type SettingField = EditableSettingField | 'apiKey'
export type DraftChange = { kind: 'set' } | { kind: 'clear' }
export type DraftChanges = Partial<Record<SettingField, DraftChange>>
export type ResolvedSettings = ReturnType<typeof import('../../shared.js').resolveTtsSettings>
export type SettingsValues = Pick<ResolvedSettings, EditableSettingField>
export type VoiceDesignAiState = 'idle' | 'loading' | 'success' | 'failed'
