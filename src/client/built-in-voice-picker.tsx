import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_VOICE_ASSET_ROUTE, TTS_VOICE_PRESETS } from '../shared.js'

type BuiltInVoicePreset = typeof TTS_VOICE_PRESETS[number]

function VoiceAvatar({ preset }: { preset: BuiltInVoicePreset }): ReactElement {
  return <img
    className="xmimo-tts-builtin-voice-avatar"
    src={`${TTS_VOICE_ASSET_ROUTE}/${preset.id}.webp`}
    alt=""
    width={36}
    height={36}
    loading="lazy"
    aria-hidden="true"
  />
}

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
  onChange: (value: string) => void
}

export function BuiltInVoicePicker({ value, disabled, label, onChange }: BuiltInVoicePickerProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedIndex = TTS_VOICE_PRESETS.findIndex((preset) => preset.value === value)
  const selected = TTS_VOICE_PRESETS[selectedIndex < 0 ? 0 : selectedIndex]!

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const focusOption = (index: number): void => {
    const normalized = (index + TTS_VOICE_PRESETS.length) % TTS_VOICE_PRESETS.length
    requestAnimationFrame(() => optionRefs.current[normalized]?.focus())
  }

  const choose = (next: string): void => {
    onChange(next)
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
      focusOption(TTS_VOICE_PRESETS.length - 1)
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
      focusOption(TTS_VOICE_PRESETS.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return <div className="xmimo-tts-builtin-voice-picker" ref={rootRef}>
    <button
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
      <VoiceAvatar preset={selected} />
      <span className="xmimo-tts-builtin-voice-copy"><strong>{selected.value}</strong><small>{selected.summary}</small></span>
      <IconChevronDownOutline14 className={open ? 'xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open' : 'xmimo-tts-voice-picker-chevron'} />
    </button>
    {open ? <div id={listboxId} className="xmimo-tts-builtin-voice-menu" role="listbox" aria-label={label}>
      {TTS_VOICE_PRESETS.map((preset, index) => <button
        key={preset.id}
        ref={(node) => { optionRefs.current[index] = node }}
        type="button"
        role="option"
        aria-selected={preset.value === value}
        className={preset.value === value ? 'xmimo-tts-builtin-voice-option xmimo-tts-builtin-voice-option-selected' : 'xmimo-tts-builtin-voice-option'}
        onClick={() => { choose(preset.value) }}
        onKeyDown={(event) => { handleOptionKeyDown(event, index) }}
      >
        {preset.value === value ? <SelectedCheck /> : null}
        <VoiceAvatar preset={preset} />
        <span className="xmimo-tts-builtin-voice-copy"><strong>{preset.value}</strong><small>{preset.summary}</small></span>
      </button>)}
    </div> : null}
  </div>
}
