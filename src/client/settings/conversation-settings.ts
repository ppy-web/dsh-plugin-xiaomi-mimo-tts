import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ttsSelectionKey } from '../../types/providers.js'
import type { TtsSettings } from '../../types/settings.js'
import { resolvedSettingsSnapshot } from './scope.js'

export function selectConversationSettings(snapshot: ConfigFormSnapshot<TtsSettings>) {
  const settings = resolvedSettingsSnapshot(snapshot)
  const { readScope, localSpeechMode, localVoiceEngine, localVoiceURI, mossBaseURL, mossVoice } = settings
  return { enabled: snapshot.value?.enabled, autoPlay: snapshot.value?.autoPlay, selection: ttsSelectionKey(settings),
    readScope, localSpeechMode, localVoiceEngine, localVoiceURI, mossBaseURL, mossVoice }
}
