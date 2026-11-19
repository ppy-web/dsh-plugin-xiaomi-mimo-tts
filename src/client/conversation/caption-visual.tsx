import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { AUDIO_RESPONSE_STYLES, type AudioResponseStyle } from '../../types/settings.js'
import { AuraField } from './voiceorbs/orbe/aura-field/aura-field.js'
import { SiriWaveLine } from './voiceorbs/orbe/siri-wave-line/siri-wave-line.js'
import type { OrbState } from './voiceorbs/lib/orb-state.js'
import { SiriSheet } from './voiceorbs/orbe/siri-sheet/siri-sheet.js'
import type { ReadingCaptions } from '../playback/reading-captions.js'

const STYLE_NAMES: Record<AudioResponseStyle, string> = {
  'aura-field': 'Aura Field',
  'siri-wave-line': 'Siri Wave Line',
  'siri-sheet': 'Siri Sheet',
}

interface CaptionVisualProps {
  variant: AudioResponseStyle
  captions?: ReadingCaptions | undefined
  state?: OrbState
  preview?: boolean
  hoverable?: boolean
  readRecordingLevel?: (() => number | undefined) | undefined
  control?: { label: string; onClick: () => void; disabled?: boolean } | undefined
}

export function CaptionVisual({ variant, captions, state = 'speaking', preview = false, hoverable = false, readRecordingLevel, control }: CaptionVisualProps): ReactElement {
  const container = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const level = useRef(0)
  const samples = useRef(new Uint8Array(256))
  useEffect(() => {
    if (state === 'listening') return
    let frame = 0
    const update = (): void => {
      const analyser = captions?.getAnalyser()
      if (analyser) {
        analyser.getByteTimeDomainData(samples.current)
        let sum = 0
        for (const sample of samples.current) sum += ((sample - 128) / 128) ** 2
        level.current = Math.min(1, Math.sqrt(sum / samples.current.length) * 5)
      } else {
        level.current = preview && state === 'speaking' ? .3 + .2 * Math.sin(performance.now() / 550) : 0
      }
      frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [captions, state, preview])

  useEffect(() => {
    if (state !== 'listening') return
    const element = container.current
    level.current = -1
    if (!element || (!readRecordingLevel && !preview)) return
    let frame = 0
    let nextSample = 0
    let previous: number | undefined
    const sample = (now: number): void => {
      if (now >= nextSample) {
        nextSample = now + 32
        const measured = readRecordingLevel ? readRecordingLevel() : (0.5 + 0.5 * Math.sin(now / 220)) ** 3
        if (measured !== previous) {
          previous = measured
          level.current = measured ?? -1
          if (measured === undefined) element.style.removeProperty('--xmimo-recording-level')
          else element.style.setProperty('--xmimo-recording-level', String(Math.sqrt(measured)))
        }
      }
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    return () => {
      cancelAnimationFrame(frame)
      element.style.removeProperty('--xmimo-recording-level')
    }
  }, [preview, readRecordingLevel, state])
  const props = { state, size: 76, levelRef: level, speed: hovered ? 0.45 : 1 }
  return <div ref={container} className="xmimo-caption-siri" data-state={state} aria-hidden={control ? undefined : true}
    data-hoverable={hoverable || undefined} data-hovered={hovered || undefined}
    onPointerEnter={hoverable ? event => { if (event.pointerType === 'mouse') setHovered(true) } : undefined}
    onPointerLeave={hoverable ? () => setHovered(false) : undefined}>
    {variant === 'aura-field' ? <AuraField {...props} /> : variant === 'siri-wave-line' ? <SiriWaveLine {...props} /> : <SiriSheet {...props} />}
    {control ? <button type="button" className="xmimo-caption-voice-button" aria-label={control.label}
      aria-disabled={control.disabled || undefined} onMouseDown={event => { event.preventDefault() }}
      onClick={() => { if (!control.disabled) control.onClick() }} /> : null}
  </div>
}

export function CaptionVisualPicker({ label, hideLabel = false, value, disabled = false, onChange }: {
  label: string
  hideLabel?: boolean
  value: AudioResponseStyle
  disabled?: boolean
  onChange: (value: AudioResponseStyle) => void
}): ReactElement {
  const name = useId()
  return <fieldset className="xmimo-caption-picker" disabled={disabled} aria-label={hideLabel ? label : undefined}>
    {hideLabel ? null : <legend>{label}</legend>}
    <div className="xmimo-caption-picker-grid">
      {AUDIO_RESPONSE_STYLES.map(style => <label className="xmimo-caption-choice" key={style}>
        <input type="radio" name={name} value={style} checked={value === style} onChange={() => onChange(style)} />
        <CaptionVisual variant={style} preview /><span>{STYLE_NAMES[style]}</span>
      </label>)}
    </div>
  </fieldset>
}
