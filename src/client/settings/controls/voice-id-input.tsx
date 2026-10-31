import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { DOUBAO_VOICE_PRESETS } from '../../../doubao-voices.js'
import { forgetVoiceId, readVoiceIdHistory, readVoiceIdNames, rememberVoiceId, writeVoiceIdHistory, writeVoiceIdNames } from '../voice-id-history.js'
import type { VoiceIdHistoryKind } from '../voice-id-history.js'
import type { Translate } from '../../localization.js'
import { VoiceIdTag } from './voice-id-tag.js'

const STANDARD_VOICE_NAMES = new Map<string, string>(DOUBAO_VOICE_PRESETS.map(voice => [voice.value, voice.name]))

export function VoiceIdInput({ value, disabled, onChange, kind, label, historyLabel, t }: { value: string; disabled: boolean; onChange: (value: string) => void; kind: VoiceIdHistoryKind; label: string; historyLabel: string; t: Translate }): ReactElement {
  const [history, setHistory] = useState(() => readVoiceIdHistory(kind))
  const [names, setNames] = useState(() => readVoiceIdNames(kind))
  const inputRef = useRef<HTMLInputElement>(null)
  const initialValue = useRef(value.trim())
  const tagRefs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => { writeVoiceIdHistory(kind, history) }, [kind, history])
  useEffect(() => { writeVoiceIdNames(kind, names) }, [kind, names])
  const remember = (voice: string): void => { setHistory(previous => rememberVoiceId(previous, voice)) }
  const remove = (voice: string): void => {
    const index = history.indexOf(voice)
    const next = history[index + 1] ?? history[index - 1]
    const remaining = forgetVoiceId(history, names, voice)
    setHistory(remaining.history)
    setNames(remaining.names)
    requestAnimationFrame(() => { (next ? tagRefs.current.get(next) : inputRef.current)?.focus() })
  }

  return <>
    <input ref={inputRef} type="text" value={value} disabled={disabled} spellCheck={false}
      aria-label={label} placeholder={label} aria-invalid={!value.trim()}
      onFocus={() => { initialValue.current = value.trim() }}
      onChange={event => onChange(event.target.value)}
      onBlur={() => { if (!disabled && initialValue.current !== value.trim()) remember(value) }}
      onKeyDown={event => {
        if (!disabled && event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          initialValue.current = value.trim()
          remember(value)
        }
      }} />
    {history.length > 0 ? <div className="xmimo-tts-voice-id-history" role="group" aria-label={historyLabel}>
      {history.map(voice => {
        const officialName = kind === 'standard' ? STANDARD_VOICE_NAMES.get(voice) : undefined
        const remark = Object.hasOwn(names, voice) ? names[voice] ?? '' : ''
        const name = remark.trim() || officialName
        return <VoiceIdTag key={voice} voice={voice} name={name} selected={value.trim() === voice} disabled={disabled} t={t}
          selectRef={element => { if (element) tagRefs.current.set(voice, element); else tagRefs.current.delete(voice) }}
          onSelect={() => { onChange(voice); remember(voice) }}
          onSave={next => { setNames(previous => ({ ...previous, [voice]: next.trim() })) }}
          onRemove={() => remove(voice)} />
      })}
    </div> : null}
  </>
}
