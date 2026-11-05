import type { SpeechCapabilities, SpeechModelCapabilities } from '../host-api.js'
import { BREEZE_MAX_TEXT_LENGTH } from '../constants.js'
import { TTS_VOICES } from '../types/models.js'
import { BREEZE_TTS_MODEL, BREEZE_VOICE_PRESETS, DOUBAO_TTS_MODELS, TTS_PROVIDERS, ttsApiKey, ttsSelection } from '../types/providers.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { DOUBAO_VOICE_PRESETS } from '../doubao-voices.js'
import { TtsProviderError } from './provider-error.js'
import { validateSynthesisSettings } from './validation.js'

/** Build an allowlisted snapshot: never return settings objects, prompts, keys or URLs. */
export function speechCapabilities(settings: ResolvedTtsSettings): SpeechCapabilities {
  return {
    provider: settings.provider,
    formats: ['mp3', 'wav', 'silk'],
    providers: TTS_PROVIDERS.map(id => {
      const selected = { ...settings, provider: id }
      const selection = ttsSelection(selected)
      let unavailableReason: string | undefined
      try { validateSynthesisSettings(selected) } catch (error) {
        unavailableReason = error instanceof TtsProviderError ? error.code : 'invalid-configuration'
      }
      let models: SpeechModelCapabilities[]
      if (id === 'xiaomi') {
        models = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign'].map(model => ({
          id: model,
          voices: model === 'mimo-v2.5-tts' ? TTS_VOICES.map(voice => ({ id: voice, name: voice })) : [],
          customVoice: false, voiceDesign: model.endsWith('-voicedesign'),
          speechInstruction: true, audioTags: model === 'mimo-v2.5-tts', voiceRate: false,
          streaming: model === 'mimo-v2.5-tts', duplex: false,
        }))
      } else if (id === 'doubao') {
        models = DOUBAO_TTS_MODELS.map(model => ({
          id: model,
          voices: model === 'seed-tts-2.0' ? DOUBAO_VOICE_PRESETS.map(voice => ({ id: voice.value, name: voice.name })) : [],
          customVoice: true, voiceDesign: false, speechInstruction: model === 'seed-tts-2.0',
          audioTags: false, voiceRate: true, streaming: true, duplex: true,
        }))
      } else {
        models = [{
          id: BREEZE_TTS_MODEL,
          voices: BREEZE_VOICE_PRESETS.map(voice => ({ id: voice.value, name: voice.name })),
          customVoice: true, voiceDesign: false, speechInstruction: true,
          audioTags: true, voiceRate: true, streaming: true, duplex: false,
        }]
      }
      return {
        id, configured: ttsApiKey(selected).length > 0, ready: unavailableReason === undefined,
        ...(unavailableReason === undefined ? {} : { unavailableReason }),
        selectedModel: selection.model, selectedVoice: selection.voice,
        maxTextLength: id === 'breeze' ? Math.min(settings.maxTextLength, BREEZE_MAX_TEXT_LENGTH) : settings.maxTextLength,
        models,
      }
    }),
  }
}
