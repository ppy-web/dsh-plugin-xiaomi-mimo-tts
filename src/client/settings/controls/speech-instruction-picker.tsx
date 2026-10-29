import type { ReactElement } from 'react'
import type { Translate } from '../../localization.js'
import type { TtsProvider } from '../../../types/providers.js'

/** MiMo user-message style descriptions; dialects follow its documented recommendations.
 * https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 */
const XIAOMI_PRESETS = [
  'Natural', 'Gentle', 'Cheerful', 'Calm', 'Story', 'Argument', 'Whisper', 'Cute',
  'Cantonese', 'Henan', 'Sichuan', 'Dongbei',
] as const

/** Doubao context_texts instructions, separate from MiMo prompts and inline speech tags.
 * https://docs.volcengine.com/docs/DoubaoVoice/DoubaoTextToSpeech20CapabilityIntroduction?lang=zh
 */
const DOUBAO_PRESETS = [
  'Natural', 'Gentle', 'Cheerful', 'Calm', 'Story', 'Argument', 'Whisper',
  'Shy', 'Weary', 'Tearful', 'Coy', 'Cute',
  'Cantonese', 'Shanghai', 'Henan', 'Beijing', 'Tianjin', 'Sichuan', 'Shaanxi', 'Dongbei',
] as const

export function SpeechInstructionPicker({ provider, value, disabled, minimal = false, onChange, t }: { provider: TtsProvider; value: string; disabled: boolean; minimal?: boolean; onChange: (value: string) => void; t: Translate }): ReactElement {
  const allPresets = provider === 'xiaomi'
    ? XIAOMI_PRESETS.map(preset => ({ preset, prompt: preset === 'Natural' ? '' : t(`settings.mimoInstruction${preset}Prompt`) }))
    : DOUBAO_PRESETS.map(preset => ({ preset, prompt: preset === 'Natural' ? '' : t(`settings.speechInstruction${preset}Prompt`) }))
  const presets = minimal ? allPresets.slice(0, 8) : allPresets
  const hint = t(provider === 'xiaomi' ? 'settings.mimoInstructionHint' : 'settings.doubaoInstructionHint')
  return <>
    <div className="xmimo-tts-instruction-presets" role="group" aria-label={t('settings.speechInstructionPresets')}>
      {presets.map(({ preset, prompt }) => {
        return <button
          key={preset}
          type="button"
          className="xmimo-tts-instruction-tag"
          disabled={disabled}
          aria-pressed={value.trim() === prompt}
          title={prompt || hint}
          onClick={() => onChange(prompt)}
        >{t(`settings.speechInstruction${preset}`)}</button>
      })}
    </div>
    {minimal ? null : <>
      <textarea
        value={value}
        rows={3}
        disabled={disabled}
        aria-label={t('settings.speechInstruction')}
        placeholder={t('settings.speechInstructionPlaceholder')}
        onChange={event => onChange(event.target.value)}
      />
      <small>{hint}</small>
    </>}
  </>
}
