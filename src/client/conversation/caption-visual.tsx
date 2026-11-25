import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { AUDIO_RESPONSE_STYLES, type AudioResponseStyle } from '../../types/settings.js'
import type { OrbState } from './voiceorbs/lib/orb-state.js'
import { observeActivity } from './voiceorbs/lib/use-in-view.js'
import { prefersReducedMotion, subscribeReducedMotion } from './voiceorbs/lib/use-reduced-motion.js'
import type { ReadingCaptions } from '../playback/reading-captions.js'

const AuraField = lazy(() => import('./voiceorbs/orbe/aura-field/aura-field.js').then(module => ({ default: module.AuraField })))
const SiriWaveLine = lazy(() => import('./voiceorbs/orbe/siri-wave-line/siri-wave-line.js').then(module => ({ default: module.SiriWaveLine })))
const SiriSheet = lazy(() => import('./voiceorbs/orbe/siri-sheet/siri-sheet.js').then(module => ({ default: module.SiriSheet })))

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
  paused?: boolean
  hoverable?: boolean
  readRecordingLevel?: (() => number | undefined) | undefined
  control?: { label: string; onClick: () => void; disabled?: boolean } | undefined
}

export function CaptionVisual({ variant, captions, state = 'speaking', preview = false, paused = false, hoverable = false, readRecordingLevel, control }: CaptionVisualProps): ReactElement {
  const container = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const level = useRef(preview && state === 'speaking' ? .35 : 0)
  const samples = useRef(new Uint8Array(256))
  useEffect(() => {
    if (state === 'listening') return
    if (paused) {
      level.current = preview && state === 'speaking' ? .35 : 0
      return
    }
    const needsLoop = (preview && state === 'speaking') || (state === 'speaking' && captions !== undefined)
    if (!needsLoop && !captions?.getAnalyser()) {
      level.current = 0
      return
    }
    const element = container.current
    let frame = 0
    let active = true
    let reduced = prefersReducedMotion()
    const halt = (): void => {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }
    const update = (): void => {
      frame = 0
      if (!active) return
      const analyser = captions?.getAnalyser()
      if (analyser) {
        analyser.getByteTimeDomainData(samples.current)
        let sum = 0
        for (const sample of samples.current) sum += ((sample - 128) / 128) ** 2
        level.current = Math.min(1, Math.sqrt(sum / samples.current.length) * 5)
      } else if (preview && state === 'speaking') {
        if (reduced) {
          level.current = 0
          return
        }
        level.current = .3 + .2 * Math.sin(performance.now() / 550)
      } else {
        level.current = 0
      }
      frame = requestAnimationFrame(update)
    }
    const sync = (): void => {
      if (active && !(preview && !captions && reduced)) {
        if (frame === 0) frame = requestAnimationFrame(update)
      } else {
        halt()
      }
    }
    const unobserve = element ? observeActivity(element, next => { active = next; sync() }) : () => {}
    const unsubReduced = preview ? subscribeReducedMotion(() => { reduced = prefersReducedMotion(); sync() }) : () => {}
    sync()
    return () => {
      halt()
      unobserve()
      unsubReduced()
    }
  }, [captions, state, preview, paused])

  useEffect(() => {
    if (state !== 'listening' || paused) return
    const element = container.current
    level.current = -1
    if (!element || (!readRecordingLevel && !preview)) return
    let frame = 0
    let active = true
    let nextSample = 0
    let previous: number | undefined
    const halt = (): void => {
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }
    const sample = (now: number): void => {
      frame = 0
      if (!active) return
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
    const unobserve = observeActivity(element, next => {
      active = next
      if (next) { if (frame === 0) frame = requestAnimationFrame(sample) }
      else halt()
    })
    frame = requestAnimationFrame(sample)
    return () => {
      halt()
      unobserve()
      element.style.removeProperty('--xmimo-recording-level')
    }
  }, [preview, paused, readRecordingLevel, state])
  const props = { state, size: 76, levelRef: level, speed: hovered ? 0.45 : 1, paused }
  return <div ref={container} className="xmimo-caption-siri" data-state={state} aria-hidden={control ? undefined : true}
    data-hoverable={hoverable || undefined} data-hovered={hovered || undefined}
    onPointerEnter={hoverable ? event => { if (event.pointerType === 'mouse') setHovered(true) } : undefined}
    onPointerLeave={hoverable ? () => setHovered(false) : undefined}>
    <Suspense fallback={null}>
      {variant === 'aura-field' ? <AuraField {...props} /> : variant === 'siri-wave-line' ? <SiriWaveLine {...props} /> : <SiriSheet {...props} />}
    </Suspense>
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
        <CaptionVisual variant={style} preview paused={value !== style} /><span>{STYLE_NAMES[style]}</span>
      </label>)}
    </div>
  </fieldset>
}
