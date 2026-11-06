export type EditableSettingField = 'showInSidebar' | 'showInHostSettings' | 'qqbotEnabled' | 'announcementSources' | 'provider' | 'doubaoModel' | 'doubaoVoice' | 'doubaoClonedVoice' | 'doubaoInstruction' | 'doubaoEnabled' | 'breezeEnabled' | 'breezeVoice' | 'breezeInstruction' | 'instruction' | 'enabled' | 'autoPlay' | 'voiceInputCompatibility' | 'inputAvoidance' | 'importantAnnouncementsFirst' | 'voiceVolume' | 'voiceRate' | 'readScope' | 'model' | 'localSpeechMode' | 'localVoiceURI' | 'localVoiceEngine' | 'mossEnabled' | 'mossBaseURL' | 'mossVoice' | 'mossVoiceName' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'soundEnabled' | 'soundVolume' | 'soundPack' | 'taskSounds' | 'clickSounds'
export type SettingField = EditableSettingField | 'apiKey' | 'doubaoApiKey' | 'breezeApiKey'
export type DraftChange = { kind: 'set' } | { kind: 'clear' }
export type DraftChanges = Partial<Record<EditableSettingField, DraftChange> & Record<'apiKey' | 'doubaoApiKey' | 'breezeApiKey', { kind: 'set' }>>
export type ResolvedSettings = ReturnType<typeof import('../../shared.js').resolveTtsSettings>
export type SettingsValues = Pick<ResolvedSettings, EditableSettingField>
