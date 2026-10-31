import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { RiCheckLine, RiDeleteBinLine, RiEditLine, RiSaveLine } from 'react-icons/ri'
import type { Translate } from '../../localization.js'

interface VoiceIdTagProps {
  voice: string
  name: string | undefined
  selected: boolean
  disabled: boolean
  t: Translate
  selectRef: (element: HTMLButtonElement | null) => void
  onSelect: () => void
  onSave: (name: string) => void
  onRemove: () => void
}

export function VoiceIdTag({ voice, name, selected, disabled, t, selectRef, onSelect, onSave, onRemove }: VoiceIdTagProps): ReactElement {
  const [mode, setMode] = useState<'idle' | 'edit' | 'confirm'>('idle')
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const displayName = name || voice
  const reset = (restoreFocus = false): void => {
    setMode('idle')
    if (restoreFocus) requestAnimationFrame(() => labelRef.current?.focus())
  }
  const save = (): void => {
    if (disabled) return
    onSave(draft.trim())
    reset(true)
  }

  useEffect(() => { if (disabled) reset() }, [disabled])
  useEffect(() => {
    if (mode === 'idle') return
    if (mode === 'edit') inputRef.current?.focus()
    const onOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) reset()
    }
    document.addEventListener('pointerdown', onOutsidePointer)
    return () => document.removeEventListener('pointerdown', onOutsidePointer)
  }, [mode])

  return <span ref={rootRef} className="xmimo-tts-voice-id-tag" data-selected={selected} data-mode={mode} data-disabled={disabled}
    onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) reset() }}
    onKeyDown={event => {
      if (event.key === 'Escape' && mode !== 'idle') { event.preventDefault(); event.stopPropagation(); reset(true) }
    }}>
    <span className="xmimo-tts-voice-id-size" aria-hidden="true">{mode === 'confirm' ? t('settings.voiceTagConfirm') : displayName}</span>
    {mode === 'edit' ? <input ref={inputRef} className="xmimo-tts-voice-id-edit" type="text" value={draft} disabled={disabled}
      aria-label={t('settings.voiceRemark')} placeholder={t('settings.voiceRemark')}
      onChange={event => setDraft(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() }
      }} /> : mode === 'confirm' ? <span className="xmimo-tts-voice-id-confirm" role="status">{t('settings.voiceTagConfirm')}</span> : <button
      ref={element => { labelRef.current = element; selectRef(element) }} type="button" className="xmimo-tts-voice-id-select"
      title={name ? `${name}\n${voice}` : voice} aria-label={name ? `${name} (${voice})` : voice}
      disabled={disabled} aria-pressed={selected} onClick={onSelect}
    >{displayName}</button>}
    <span className="xmimo-tts-voice-id-actions">
      {mode !== 'confirm' ? <button type="button" className="xmimo-tts-voice-id-action" disabled={disabled}
        aria-label={`${t(mode === 'edit' ? 'settings.save' : 'settings.voiceTagEdit')}: ${displayName}`}
        title={t(mode === 'edit' ? 'settings.save' : 'settings.voiceTagEdit')}
        onClick={() => {
          if (mode === 'edit') save()
          else { setDraft(name || ''); setMode('edit') }
        }}
      >{mode === 'edit' ? <RiSaveLine size={14} aria-hidden="true" /> : <RiEditLine size={14} aria-hidden="true" />}</button> : null}
      {mode !== 'edit' ? <button type="button" className="xmimo-tts-voice-id-action xmimo-tts-voice-id-delete" disabled={disabled}
        aria-label={`${t(mode === 'confirm' ? 'settings.voiceTagConfirm' : 'settings.voiceTagRemove')}: ${displayName}`}
        title={t(mode === 'confirm' ? 'settings.voiceTagConfirm' : 'settings.voiceTagRemove')}
        onClick={() => {
          if (mode === 'confirm') onRemove()
          else setMode('confirm')
        }}
      >{mode === 'confirm' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiDeleteBinLine size={14} aria-hidden="true" />}</button> : null}
    </span>
  </span>
}
