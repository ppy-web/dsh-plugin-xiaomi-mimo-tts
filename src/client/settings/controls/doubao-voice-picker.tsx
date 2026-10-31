import type { ReactElement } from 'react'
import { useState } from 'react'
import { DOUBAO_VOICE_PRESETS } from '../../../doubao-voices.js'
import type { Translate } from '../../localization.js'
import { VoicePresetPicker } from './built-in-voice-picker.js'
import type { VoicePickerPreset } from './built-in-voice-picker.js'
import { VoiceIdInput } from './voice-id-input.js'

const CUSTOM_VOICE = '__custom__'
const MINIMAL_VOICE_IDS = new Set([
  'zh_female_vv_uranus_bigtts',
  'zh_female_xiaohe_uranus_bigtts',
  'zh_male_m191_uranus_bigtts',
  'zh_male_taocheng_uranus_bigtts',
])

export function DoubaoVoicePicker({ value, disabled, minimal = false, onChange, t }: { value: string; disabled: boolean; minimal?: boolean; onChange: (value: string) => void; t: Translate }): ReactElement {
  const [custom, setCustom] = useState(!DOUBAO_VOICE_PRESETS.some(voice => voice.value === value))
  const voices = minimal ? DOUBAO_VOICE_PRESETS.filter(voice => MINIMAL_VOICE_IDS.has(voice.value)) : DOUBAO_VOICE_PRESETS
  const known = voices.some(voice => voice.value === value)
  const presets: VoicePickerPreset[] = [{
    id: CUSTOM_VOICE,
    value: CUSTOM_VOICE,
    label: t('settings.doubaoCustomVoice'),
    summary: t('settings.doubaoCustomVoiceHint'),
    fullWidth: true,
    avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-doubao-voice-avatar" aria-hidden="true">＋</span>,
  }, ...voices.map(voice => ({
    id: voice.value,
    value: voice.value,
    label: voice.name,
    summary: `${t(voice.scene === '角色' ? 'settings.doubaoVoiceSceneRole' : voice.scene === '配音' ? 'settings.doubaoVoiceSceneDubbing' : voice.scene === '阅读' ? 'settings.doubaoVoiceSceneReading' : 'settings.doubaoVoiceSceneGeneral')} · ${t('settings.doubaoVoiceChinese')}`,
    avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-doubao-voice-avatar" aria-hidden="true">{voice.name.slice(0, 1)}</span>,
  }))]
  return <div className="xmimo-tts-doubao-voice-picker">
    <VoicePresetPicker presets={presets} label={t('settings.voice')} value={custom || !known ? CUSTOM_VOICE : value} disabled={disabled} minimal={minimal} onChange={next => {
      if (next === CUSTOM_VOICE) setCustom(true)
      else { setCustom(false); onChange(next) }
    }} />
    {custom || !known ? <VoiceIdInput kind="standard" value={value} disabled={disabled} label={t('settings.doubaoVoiceId')} historyLabel={t('settings.doubaoStandardVoiceHistory')} t={t} onChange={onChange} /> : <small>{value}</small>}
  </div>
}
