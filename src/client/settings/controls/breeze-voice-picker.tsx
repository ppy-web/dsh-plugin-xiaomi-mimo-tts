import type { ReactElement } from 'react'
import { useState } from 'react'
import { BREEZE_VOICE_PRESETS } from '../../../types/providers.js'
import type { Translate } from '../../localization.js'
import { VoicePresetPicker } from './built-in-voice-picker.js'
import type { VoicePickerPreset } from './built-in-voice-picker.js'
import { VoiceAvatar } from './voice-avatar.js'
import { VoiceIdInput } from './voice-id-input.js'

const CUSTOM_VOICE = '__custom__'

export function BreezeVoicePicker({ value, disabled, t, onChange }: {
  value: string
  disabled: boolean
  t: Translate
  onChange: (value: string) => void
}): ReactElement {
  const known = BREEZE_VOICE_PRESETS.some(item => item.value === value)
  const [custom, setCustom] = useState(!known)
  const customSelected = custom || !known
  const customLabel = t('settings.breezeCustomVoice')
  const presets: VoicePickerPreset[] = [
    {
      id: CUSTOM_VOICE,
      value: CUSTOM_VOICE,
      label: customLabel,
      summary: t('settings.breezeCustomVoiceHint'),
      fullWidth: true,
      avatar: <VoiceAvatar voice={known ? undefined : { provider: 'breeze', id: value }} label={customLabel} fallback="+" />,
    },
    ...BREEZE_VOICE_PRESETS.map(voice => ({
      id: voice.value,
      value: voice.value,
      label: voice.name,
      summary: voice.language,
      avatar: <VoiceAvatar voice={{ provider: 'breeze', id: voice.value }} label={voice.name} />,
    })),
  ]
  return <div className="xmimo-tts-breeze-voice-picker">
    <VoicePresetPicker presets={presets} label={t('settings.voice')} value={customSelected ? CUSTOM_VOICE : value} disabled={disabled} onChange={next => {
      if (next === CUSTOM_VOICE) setCustom(true)
      else { setCustom(false); onChange(next) }
    }} />
    {customSelected ? <VoiceIdInput kind="breeze" value={value} disabled={disabled} label={t('settings.breezeVoiceHint')} historyLabel={t('settings.breezeVoiceHistory')} t={t} onChange={onChange} /> : <small>{value}</small>}
  </div>
}
