export type EditableSettingField = 'qqbotEnabled' | 'announcementSources' | 'provider' | 'doubaoModel' | 'doubaoVoice' | 'doubaoClonedVoice' | 'doubaoInstruction' | 'instruction' | 'enabled' | 'autoPlay' | 'voiceVolume' | 'voiceRate' | 'readScope' | 'model' | 'localSpeechMode' | 'localVoiceURI' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'soundEnabled' | 'soundVolume' | 'soundPack' | 'taskSounds' | 'clickSounds'
export type SettingField = EditableSettingField | 'apiKey' | 'doubaoApiKey'
export type DraftChange = { kind: 'set' } | { kind: 'clear' }
export type DraftChanges = Partial<Record<EditableSettingField, DraftChange> & Record<'apiKey' | 'doubaoApiKey', { kind: 'set' }>>
export type ResolvedSettings = ReturnType<typeof import('../../shared.js').resolveTtsSettings>
export type SettingsValues = Pick<ResolvedSettings, EditableSettingField>
