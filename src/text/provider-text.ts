import { prepareBreezeTtsText, prepareTtsText, prepareXiaomiTtsText } from './normalize.js'
import { stripXiaomiAudioTags } from './xiaomi-audio-tags.js'

export interface AudioTagSelection { provider?: string; model?: string }

export function supportsXiaomiAudioTags(settings: AudioTagSelection): boolean {
  return (settings.provider ?? 'xiaomi') === 'xiaomi' && (settings.model ?? 'mimo-v2.5-tts') === 'mimo-v2.5-tts'
}

export function prepareProviderTtsText(value: string, settings: AudioTagSelection): string {
  if (settings.provider === 'breeze') return prepareBreezeTtsText(value)
  if (supportsXiaomiAudioTags(settings)) return prepareXiaomiTtsText(value)
  return prepareTtsText((settings.provider ?? 'xiaomi') === 'xiaomi' ? stripXiaomiAudioTags(value) : value)
}
