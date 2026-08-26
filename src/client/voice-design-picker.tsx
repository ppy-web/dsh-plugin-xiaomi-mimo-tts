import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_VOICE_DESIGN_ASSET_ROUTE, TTS_VOICE_DESIGN_PRESETS } from '../shared.js'

export const CUSTOM_VOICE_DESIGN_OPTION = '__custom__'

export function isPresetVoiceDesignPrompt(value: string): boolean {
  return TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === value)
}

type VoiceDesignPreset = typeof TTS_VOICE_DESIGN_PRESETS[number]

function VoicePresetAvatar({ preset }: { preset: VoiceDesignPreset }): ReactElement {
  return <img
    className="xmimo-tts-voice-avatar"
    src={`${TTS_VOICE_DESIGN_ASSET_ROUTE}/${preset.id}.webp`}
    alt=""
    width={40}
    height={40}
    loading="lazy"
    aria-hidden="true"
  />
}

function CustomVoiceAvatar(): ReactElement {
  return <span className="xmimo-tts-voice-avatar xmimo-tts-custom-voice-avatar" aria-hidden="true">
    <svg viewBox="0 0 40 40" focusable="false">
      <circle cx="20" cy="14" r="6" />
      <path d="M9.5 31.5c1.7-6.2 5.2-9.3 10.5-9.3s8.8 3.1 10.5 9.3" />
      <path d="M31 8v8M27 12h8" />
    </svg>
  </span>
}

interface VoiceDesignPresetPickerProps {
  value: string
  disabled: boolean
  label: string
  customLabel: string
  customSummary: string
  onChange: (value: string) => void
}

export function VoiceDesignPresetPicker({ value, disabled, label, customLabel, customSummary, onChange }: VoiceDesignPresetPickerProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedPresetIndex = TTS_VOICE_DESIGN_PRESETS.findIndex((item) => item.prompt === value)
  const selectedPreset = selectedPresetIndex < 0 ? undefined : TTS_VOICE_DESIGN_PRESETS[selectedPresetIndex]
  const selectedOptionIndex = selectedPresetIndex + 1
  const optionCount = TTS_VOICE_DESIGN_PRESETS.length + 1

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
    const normalized = (index + optionCount) % optionCount
    requestAnimationFrame(() => optionRefs.current[normalized]?.focus())
  }

  const openAndFocus = (index: number): void => {
    setOpen(true)
    focusOption(index)
  }

  const choose = (next: string): void => {
    onChange(next)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAndFocus(selectedOptionIndex)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocus(selectedOptionIndex === 0 ? optionCount - 1 : selectedOptionIndex)
    } else if (event.key === 'Home') {
      event.preventDefault()
      openAndFocus(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      openAndFocus(optionCount - 1)
    }
  }

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(optionCount - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return <div className="xmimo-tts-voice-picker" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="xmimo-tts-voice-picker-trigger"
      disabled={disabled}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => { setOpen((current) => !current) }}
      onKeyDown={handleTriggerKeyDown}
    >
      {selectedPreset === undefined ? <CustomVoiceAvatar /> : <VoicePresetAvatar preset={selectedPreset} />}
      <span className="xmimo-tts-voice-option-copy">
        <strong>{selectedPreset?.label ?? customLabel}</strong>
        <small>{selectedPreset?.summary ?? customSummary}</small>
      </span>
      <IconChevronDownOutline14 className={open ? 'xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open' : 'xmimo-tts-voice-picker-chevron'} />
    </button>
    {open ? <div id={listboxId} className="xmimo-tts-voice-picker-menu" role="listbox" aria-label={label}>
      <button
        ref={(node) => { optionRefs.current[0] = node }}
        type="button"
        role="option"
        aria-selected={selectedPreset === undefined}
        className={selectedPreset === undefined ? 'xmimo-tts-voice-option xmimo-tts-voice-option-selected' : 'xmimo-tts-voice-option'}
        onClick={() => { choose(CUSTOM_VOICE_DESIGN_OPTION) }}
        onKeyDown={(event) => { handleOptionKeyDown(event, 0) }}
      >
        <CustomVoiceAvatar />
        <span className="xmimo-tts-voice-option-copy"><strong>{customLabel}</strong><small>{customSummary}</small></span>
      </button>
      {TTS_VOICE_DESIGN_PRESETS.map((preset, index) => <button
        key={preset.id}
        ref={(node) => { optionRefs.current[index + 1] = node }}
        type="button"
        role="option"
        aria-selected={selectedPreset?.id === preset.id}
        className={selectedPreset?.id === preset.id ? 'xmimo-tts-voice-option xmimo-tts-voice-option-selected' : 'xmimo-tts-voice-option'}
        onClick={() => { choose(preset.prompt) }}
        onKeyDown={(event) => { handleOptionKeyDown(event, index + 1) }}
      >
        <VoicePresetAvatar preset={preset} />
        <span className="xmimo-tts-voice-option-copy"><strong>{preset.label}</strong><small>{preset.summary}</small></span>
      </button>)}
    </div> : null}
  </div>
}
