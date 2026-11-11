import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_VOICE_PRESETS } from '../../../shared.js'
import { VoiceAvatar } from './voice-avatar.js'

export interface VoicePickerPreset {
  id: string
  value: string
  label: string
  summary: string
  avatar: ReactElement
  fullWidth?: boolean
}

const BUILT_IN_PRESETS: VoicePickerPreset[] = TTS_VOICE_PRESETS.map(preset => ({
  ...preset,
  label: preset.value,
  avatar: <VoiceAvatar voice={{ provider: 'xiaomi', id: preset.value }} label={preset.value} />,
}))

function SelectedCheck(): ReactElement {
  return <svg className="xmimo-tts-builtin-voice-check" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" />
    <path d="m4.8 8.1 2 2 4.4-4.5" />
  </svg>
}

interface BuiltInVoicePickerProps {
  value: string
  disabled: boolean
  label: string
  minimal?: boolean
  onChange: (value: string) => void
}

export function BuiltInVoicePicker({ value, disabled, label, minimal = false, onChange }: BuiltInVoicePickerProps): ReactElement {
  return <VoicePresetPicker value={value} disabled={disabled} label={label} minimal={minimal} onChange={onChange} presets={BUILT_IN_PRESETS} />
}

export function VoicePresetPicker({ value, disabled, label, minimal = false, onChange, presets }: BuiltInVoicePickerProps & { presets: readonly VoicePickerPreset[] }): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedIndex = presets.findIndex((preset) => preset.value === value)
  const selected = presets[selectedIndex < 0 ? 0 : selectedIndex]!

  useEffect(() => {
    if (minimal || !open) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [minimal, open])

  useEffect(() => {
    if (!minimal && disabled) setOpen(false)
  }, [disabled, minimal])

  const focusOption = (index: number): void => {
    const normalized = (index + presets.length) % presets.length
    requestAnimationFrame(() => optionRefs.current[normalized]?.focus())
  }

  const choose = (next: string): void => {
    onChange(next)
    if (minimal) return
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      focusOption(selectedIndex < 0 ? 0 : selectedIndex)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setOpen(true)
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      focusOption(presets.length - 1)
    }
  }

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(presets.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return <div className="xmimo-tts-builtin-voice-picker" ref={rootRef}>
    {!minimal ? <button
      ref={triggerRef}
      type="button"
      className="xmimo-tts-builtin-voice-trigger"
      disabled={disabled}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => { setOpen((current) => !current) }}
      onKeyDown={handleTriggerKeyDown}
    >
      {selected.avatar}
      <span className="xmimo-tts-builtin-voice-copy"><strong>{selected.label}</strong><small>{selected.summary}</small></span>
      {minimal
        ? <span className="xmimo-tts-voice-picker-text-caret" aria-hidden="true">⌄</span>
        : <IconChevronDownOutlineMedium className={open ? 'xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open' : 'xmimo-tts-voice-picker-chevron'} size={14} />}
    </button> : null}
    {(minimal || open) ? <div id={listboxId} className="xmimo-tts-builtin-voice-menu" role="listbox" aria-label={label}>
      {presets.map((preset, index) => <button
        key={preset.id}
        ref={(node) => { optionRefs.current[index] = node }}
        type="button"
        role="option"
        aria-selected={preset.value === value}
        disabled={disabled}
        className={`xmimo-tts-builtin-voice-option${preset.value === value ? ' xmimo-tts-builtin-voice-option-selected' : ''}${preset.fullWidth ? ' xmimo-tts-builtin-voice-option-custom' : ''}`}
        onClick={() => { choose(preset.value) }}
        onKeyDown={(event) => { handleOptionKeyDown(event, index) }}
      >
        {!minimal && preset.value === value ? <SelectedCheck /> : null}
        {minimal ? null : preset.avatar}
        <span className="xmimo-tts-builtin-voice-copy"><strong>{preset.label}</strong><small>{preset.summary}</small></span>
      </button>)}
    </div> : null}
  </div>
}
