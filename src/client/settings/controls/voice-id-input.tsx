import type { ReactElement } from 'react'
import { useEffect, useId, useState } from 'react'
import { DOUBAO_VOICE_PRESETS } from '../../../doubao-voices.js'
import { readVoiceIdHistory, readVoiceIdNames, rememberVoiceId, writeVoiceIdHistory, writeVoiceIdNames } from '../voice-id-history.js'
import type { VoiceIdHistoryKind } from '../voice-id-history.js'
import type { Translate } from '../../localization.js'

const STANDARD_VOICE_NAMES = new Map<string, string>(DOUBAO_VOICE_PRESETS.map(voice => [voice.value, voice.name]))

export function VoiceIdInput({ value, disabled, onChange, kind, label, historyLabel, t, rememberInitialValue = true }: { value: string; disabled: boolean; onChange: (value: string) => void; kind: VoiceIdHistoryKind; label: string; historyLabel: string; t: Translate; rememberInitialValue?: boolean }): ReactElement {
  const [history, setHistory] = useState(() => {
    const saved = readVoiceIdHistory(kind)
    return rememberInitialValue ? rememberVoiceId(saved, value) : saved
  })
  const [names, setNames] = useState(() => readVoiceIdNames(kind))
  const nameHintId = useId()
  useEffect(() => { writeVoiceIdHistory(kind, history) }, [kind, history])
  useEffect(() => { writeVoiceIdNames(kind, names) }, [kind, names])
  const remember = (voice: string): void => { setHistory(previous => rememberVoiceId(previous, voice)) }
  const voiceName = (voice: string): string | undefined => (kind === 'standard' ? STANDARD_VOICE_NAMES.get(voice) : undefined)
    || (Object.hasOwn(names, voice) ? names[voice]?.trim() : undefined)
  const voiceId = value.trim()
  const known = kind === 'standard' && STANDARD_VOICE_NAMES.has(voiceId)

  return <>
    <div className="xmimo-tts-voice-id-inputs">
      <input
        type="text"
        value={value}
        disabled={disabled}
        spellCheck={false}
        aria-label={label}
        placeholder={label}
        aria-invalid={!value.trim()}
        onChange={event => onChange(event.target.value)}
        onBlur={() => { if (!disabled) remember(value) }}
        onKeyDown={event => {
          if (!disabled && event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            remember(value)
          }
        }}
      />
      {!known ? <input
        type="text"
        value={Object.hasOwn(names, voiceId) ? names[voiceId] : ''}
        disabled={disabled || !voiceId}
        aria-label={t('settings.voiceRemark')}
        aria-describedby={nameHintId}
        placeholder={t('settings.voiceRemark')}
        onChange={event => {
          const name = event.target.value
          setNames(previous => ({ ...previous, [voiceId]: name }))
        }}
        onBlur={() => { if (!disabled) remember(value) }}
        onKeyDown={event => {
          if (!disabled && event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            remember(value)
          }
        }}
      /> : null}
    </div>
    {!known ? <small id={nameHintId}>{t('settings.voiceRemarkHint')}</small> : null}
    {history.length > 0 ? <div className="xmimo-tts-voice-id-history" role="group" aria-label={historyLabel}>
      {history.map(voice => {
        const name = voiceName(voice)
        return <button
          key={voice}
          type="button"
          className="xmimo-tts-voice-id-tag"
          title={name ? `${name}\n${voice}` : voice}
          aria-label={name ? `${name} (${voice})` : voice}
          disabled={disabled}
          aria-pressed={voiceId === voice}
          onClick={() => { onChange(voice); remember(voice) }}
        >{name || voice}</button>
      })}
    </div> : null}
  </>
}
