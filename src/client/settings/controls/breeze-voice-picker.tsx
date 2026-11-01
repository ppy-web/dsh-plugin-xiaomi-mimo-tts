import type { ReactElement } from 'react'
import { useState } from 'react'
import { BREEZE_VOICE_PRESETS } from '../../../types/providers.js'
import type { Translate } from '../../localization.js'
import { VoicePresetPicker } from './built-in-voice-picker.js'
import type { VoicePickerPreset } from './built-in-voice-picker.js'
import { VoiceIdInput } from './voice-id-input.js'

const CUSTOM_VOICE = '__custom__'

export function BreezeVoicePicker({ value, disabled, t, onChange }: {
  value: string
  disabled: boolean
  t: Translate
  onChange: (value: string) => void
}): ReactElement {
  const [custom, setCustom] = useState(!BREEZE_VOICE_PRESETS.some(item => item.value === value))
  const presets: VoicePickerPreset[] = [
    { id: CUSTOM_VOICE, value: CUSTOM_VOICE, label: t('settings.breezeCustomVoice'), summary: t('settings.breezeCustomVoiceHint'), fullWidth: true, avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-doubao-voice-avatar" aria-hidden="true">+</span> },
    ...BREEZE_VOICE_PRESETS.map(voice => ({
      id: voice.value,
      value: voice.value,
      label: voice.name,
      summary: voice.language,
      avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-doubao-voice-avatar" aria-hidden="true">{voice.name.slice(0, 1)}</span>,
    })),
  ]
  return <div className="xmimo-tts-breeze-voice-picker">
    <VoicePresetPicker presets={presets} label={t('settings.voice')} value={custom ? CUSTOM_VOICE : value} disabled={disabled} onChange={next => {
      if (next === CUSTOM_VOICE) setCustom(true)
      else { setCustom(false); onChange(next) }
    }} />
    {custom ? <VoiceIdInput kind="breeze" value={value} disabled={disabled} label={t('settings.breezeVoiceHint')} historyLabel={t('settings.breezeVoiceHistory')} t={t} onChange={onChange} /> : <small>{value}</small>}
  </div>
}
