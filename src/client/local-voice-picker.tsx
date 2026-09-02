import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'

export interface LocalVoicePickerProps {
  value: string
  disabled?: boolean
  label: string
  unavailableLabel: string
  loadingLabel: string
  offlineLabel: string
  onlineLabel: string
  onChange: (voiceURI: string) => void
}

function availableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || window.speechSynthesis === undefined) return []
  return [...window.speechSynthesis.getVoices()].sort((left, right) => {
    const rank = (voice: SpeechSynthesisVoice): number => {
      if (voice.localService) return 0
      const language = voice.lang.toLowerCase()
      if (language === 'zh' || language.startsWith('zh-')) return 1
      if (language === 'en' || language.startsWith('en-')) return 2
      return 3
    }
    return rank(left) - rank(right) || left.name.localeCompare(right.name) || left.lang.localeCompare(right.lang)
  })
}

function pickVoice(voices: readonly SpeechSynthesisVoice[], value: string): SpeechSynthesisVoice | undefined {
  const language = typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN'
  return voices.find((voice) => voice.voiceURI === value)
    ?? voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase().split('-')[0] ?? 'zh'))
    ?? voices.find((voice) => voice.default)
    ?? voices[0]
}

export function LocalVoicePicker({ value, disabled = false, label, unavailableLabel, loadingLabel, offlineLabel, onlineLabel, onChange }: LocalVoicePickerProps): ReactElement {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesReady, setVoicesReady] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()

  useEffect(() => {
    if (typeof window === 'undefined' || window.speechSynthesis === undefined) { setVoicesReady(true); return }
    const update = (): void => { setVoices(availableVoices()); setVoicesReady(true) }
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const selected = useMemo(() => pickVoice(voices, value), [value, voices])
  const selectedValue = selected?.voiceURI ?? value
  const choose = (voice: SpeechSynthesisVoice): void => {
    onChange(voice.voiceURI)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const focusOption = (index: number): void => {
    if (voices.length === 0) return
    const normalized = (index + voices.length) % voices.length
    requestAnimationFrame(() => optionRefs.current[normalized]?.focus())
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (voices.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      const selectedIndex = Math.max(0, voices.findIndex((voice) => voice.voiceURI === selectedValue))
      focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? voices.length - 1 : selectedIndex)
    }
  }

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); focusOption(index - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusOption(0) }
    else if (event.key === 'End') { event.preventDefault(); focusOption(voices.length - 1) }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus() }
    else if (event.key === 'Tab') setOpen(false)
  }

  const triggerText = selected?.name ?? (!voicesReady ? loadingLabel : unavailableLabel)
  const voiceSummary = (voice: SpeechSynthesisVoice): string => `${voice.lang} · ${voice.localService ? offlineLabel : onlineLabel}`

  return (
    <div className="xmimo-tts-builtin-voice-picker" ref={rootRef}>
      <button ref={triggerRef} type="button" className="xmimo-tts-builtin-voice-trigger" disabled={disabled || voices.length === 0} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined} aria-label={label} onClick={() => setOpen((current) => !current)} onKeyDown={handleTriggerKeyDown}>
        <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-local-voice-avatar" aria-hidden="true">🔊</span>
        <span className="xmimo-tts-builtin-voice-copy">
          <strong>{triggerText}</strong>
          <small>{selected === undefined ? (!voicesReady ? loadingLabel : unavailableLabel) : voiceSummary(selected)}</small>
        </span>
        <IconChevronDownOutline14 className={open ? 'xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open' : 'xmimo-tts-voice-picker-chevron'} />
      </button>
      {open ? <div id={listboxId} className="xmimo-tts-builtin-voice-menu" role="listbox" aria-label={label}>
        {voices.map((voice, index) => <button ref={(node) => { optionRefs.current[index] = node }} type="button" role="option" aria-selected={voice.voiceURI === selectedValue} key={voice.voiceURI} className={voice.voiceURI === selectedValue ? 'xmimo-tts-builtin-voice-option xmimo-tts-builtin-voice-option-selected' : 'xmimo-tts-builtin-voice-option'} onClick={() => choose(voice)} onKeyDown={(event) => handleOptionKeyDown(event, index)}>
          {voice.voiceURI === selectedValue ? <svg className="xmimo-tts-builtin-voice-check" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" /><path d="m4.8 8.1 2 2 4.4-4.5" /></svg> : null}
          <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-local-voice-avatar" aria-hidden="true">🔊</span>
          <span className="xmimo-tts-voice-option-copy"><strong>{voice.name}</strong><small>{voiceSummary(voice)}</small></span>
        </button>)}
      </div> : null}
    </div>
  )
}

export function resolveLocalVoice(voices: readonly SpeechSynthesisVoice[], value: string): SpeechSynthesisVoice | undefined {
  return pickVoice(voices, value)
}
