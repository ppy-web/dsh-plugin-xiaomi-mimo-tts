import type { ReactElement } from 'react'
import type { LocaleKey, Translate } from '../../localization.js'
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

const BREEZE_PRESETS = [
  'Natural', 'WhisperFear', 'ExcitedSurprise', 'SarcasticDisbelief', 'NervousHumor', 'RestrainedGrief',
  'CalmNarration', 'WarmCompanion', 'PlayfulTeasing', 'SeriousAnnouncement', 'EncouragingSupport', 'SleepyBedtime',
] as const

export function SpeechInstructionPicker({ provider, value, disabled, minimal = false, onChange, t }: { provider: TtsProvider; value: string; disabled: boolean; minimal?: boolean; onChange: (value: string) => void; t: Translate }): ReactElement {
  const presets = provider === 'xiaomi'
    ? XIAOMI_PRESETS.map(preset => ({ preset, prompt: preset === 'Natural' ? '' : t(`settings.mimoInstruction${preset}Prompt`) }))
    : provider === 'breeze'
      ? BREEZE_PRESETS.map(preset => ({ preset, prompt: preset === 'Natural' ? '' : t(`settings.breezeInstructionText${preset}`) }))
      : DOUBAO_PRESETS.map(preset => ({ preset, prompt: preset === 'Natural' ? '' : t(`settings.speechInstruction${preset}Prompt`) }))
  const hint = t(provider === 'xiaomi' ? 'settings.mimoInstructionHint' : provider === 'breeze' ? 'settings.breezeInstructionHint' : 'settings.doubaoInstructionHint')
  return <>
    <div className="xmimo-tts-instruction-editor">
      <textarea
        value={value}
        rows={minimal ? 3 : 4}
        disabled={disabled}
        aria-label={t('settings.speechInstruction')}
        placeholder={t('settings.speechInstructionPlaceholder')}
        onChange={event => onChange(event.target.value)}
      />
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
          >{provider === 'breeze' && preset !== 'Natural' ? t(`settings.breezeInstructionLabel${preset}` as LocaleKey) : t(`settings.speechInstruction${preset}` as LocaleKey)}</button>
        })}
      </div>
    </div>
    {minimal ? null : <small>{hint}</small>}
  </>
}
