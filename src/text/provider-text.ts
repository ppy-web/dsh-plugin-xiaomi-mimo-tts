import { prepareBreezeTtsText, prepareTtsText, prepareXiaomiTtsText, prepareXiaomiVoiceDesignText } from './normalize.js'
import { isKnownXiaomiAudioTag } from './xiaomi-audio-tags.js'

export interface AudioTagSelection { provider?: string; model?: string }

export function supportsXiaomiAudioTags(settings: AudioTagSelection): boolean {
  return (settings.provider ?? 'xiaomi') === 'xiaomi' && (settings.model ?? 'mimo-v2.5-tts') === 'mimo-v2.5-tts'
}

export function prepareProviderTtsText(value: string, settings: AudioTagSelection, conversation = false): string {
  if (settings.provider === 'breeze') return prepareBreezeTtsText(value)
  if (supportsXiaomiAudioTags(settings)) return prepareXiaomiTtsText(value, conversation ? isKnownXiaomiAudioTag : undefined)
  return (settings.provider ?? 'xiaomi') === 'xiaomi' ? prepareXiaomiVoiceDesignText(value) : prepareTtsText(value)
}
