import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DOUBAO_VOICE_PRESETS } from '../../../doubao-voices.js'
import { BREEZE_VOICE_PRESETS } from '../../../types/providers.js'
import { subscribeVoiceIds, voiceIdRevision, forgetVoiceId, readVoiceIdHistory, readVoiceIdNames, rememberVoiceId, writeVoiceIdHistory, writeVoiceIdNames } from '../voice-id-history.js'
import type { VoiceIdHistoryKind } from '../voice-id-history.js'
import type { Translate } from '../../localization.js'
import { VoiceIdTag } from './voice-id-tag.js'

const STANDARD_VOICE_NAMES = new Map<string, string>([...DOUBAO_VOICE_PRESETS.map(voice => [voice.value, voice.name] as const), ...BREEZE_VOICE_PRESETS.map(voice => [voice.value, voice.name] as const)])

export function VoiceIdInput({ value, disabled, onChange, kind, label, historyLabel, t }: { value: string; disabled: boolean; onChange: (value: string) => void; kind: VoiceIdHistoryKind; label: string; historyLabel: string; t: Translate }): ReactElement {
  const [history, setHistory] = useState(() => readVoiceIdHistory(kind))
  const [names, setNames] = useState(() => readVoiceIdNames(kind))
  const inputRef = useRef<HTMLInputElement>(null)
  const initialValue = useRef(value.trim())
  const tagRefs = useRef(new Map<string, HTMLButtonElement>())
  const revision = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  useEffect(() => { setHistory(readVoiceIdHistory(kind)); setNames(readVoiceIdNames(kind)) }, [kind, revision])
  const remember = (voice: string): void => {
    const next = rememberVoiceId(readVoiceIdHistory(kind), voice)
    setHistory(next)
    writeVoiceIdHistory(kind, next)
  }
  const remove = (voice: string): void => {
    const index = history.indexOf(voice)
    const next = history[index + 1] ?? history[index - 1]
    const remaining = forgetVoiceId(history, names, voice)
    setHistory(remaining.history)
    setNames(remaining.names)
    writeVoiceIdHistory(kind, remaining.history)
    writeVoiceIdNames(kind, remaining.names)
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
          onSave={next => { const saved = { ...readVoiceIdNames(kind), [voice]: next.trim() }; setNames(saved); writeVoiceIdNames(kind, saved) }}
          onRemove={() => remove(voice)} />
      })}
    </div> : null}
  </>
}
