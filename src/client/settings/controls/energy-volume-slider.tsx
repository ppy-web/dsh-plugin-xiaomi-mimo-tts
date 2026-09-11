import type { CSSProperties, PointerEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

export interface EnergyVolumeSliderProps {
  value: number
  label: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  formatValue?: (value: number) => string
  onChange: (value: number) => void
  onInteractionEnd?: (value: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : max
}

const DOT_COUNT = 48
const DOT_POSITIONS = Array.from({ length: DOT_COUNT }, (_, index) => {
  // Stable pseudo-random positions keep rerenders from making the particles jump.
  const randomAt = (offset: number): number => {
    const seed = Math.sin(index * (12.9898 + offset) + 78.233 + offset * 31.7) * 43758.5453
    return seed - Math.floor(seed)
  }
  const random = randomAt(0)
  const progress = index / (DOT_COUNT - 1)
  return {
    x: 2 + progress * 96 + (random - .5) * 2,
    y: 28 + random * 44,
    size: 2 + randomAt(1) * 2,
    driftX: `${(randomAt(2) - .5) * 8}px`,
    driftY: `${(randomAt(3) - .5) * 10}px`,
    duration: `${2.4 + randomAt(4) * 2.8}s`,
    delay: `${-randomAt(5) * 3.5}s`,
  }
})

/** A controlled, accessible energy slider with transient pointer feedback. */
export function EnergyVolumeSlider({ value, label, disabled = false, min = 0, max = 1, step = 0.01, formatValue, onChange, onInteractionEnd }: EnergyVolumeSliderProps): ReactElement {
  const lower = Number.isFinite(min) ? min : 0
  const upper = Number.isFinite(max) && max > lower ? max : lower + 1
  const increment = Number.isFinite(step) && step > 0 ? step : (upper - lower) / 100
  const [dragging, setDragging] = useState(false)
  const [pulse, setPulse] = useState(0)
  const draggingRef = useRef(false)
  const keyboardInteractingRef = useRef(false)
  const current = clamp(value, lower, upper)
  const latestValueRef = useRef(current)
  const normalized = (current - lower) / (upper - lower)
  const percent = Math.round(normalized * 100)
  useEffect(() => {
    if (!draggingRef.current) latestValueRef.current = current
  }, [current])
  const begin = (event: PointerEvent<HTMLInputElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    setDragging(true)
  }
  const finish = (): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    setPulse((current) => current + 1)
    onInteractionEnd?.(latestValueRef.current)
  }

  return <span className="xmimo-tts-energy" data-dragging={dragging} data-high={normalized > .85} data-disabled={disabled} style={{ '--volume': `${percent}%` } as CSSProperties}>
    <span className="xmimo-tts-energy-fill" aria-hidden="true" />
    <span key={pulse} className={pulse ? 'xmimo-tts-energy-dots xmimo-tts-energy-pulse' : 'xmimo-tts-energy-dots'} aria-hidden="true">
      {DOT_POSITIONS.map(({ x, y, size, driftX, driftY, duration, delay }, index) => <i key={index} style={{ '--dot': index, '--dot-x': `${x}%`, '--dot-y': `${y}%`, '--dot-size': `${size}px`, '--drift-x': driftX, '--drift-y': driftY, '--drift-duration': duration, '--drift-delay': delay, opacity: index / DOT_COUNT < normalized ? .7 : .15 } as CSSProperties} />)}
    </span>
    <input
      type="range"
      min={lower}
      max={upper}
      step={increment}
      value={current}
      aria-label={label}
      aria-valuetext={formatValue?.(current) ?? `${percent}%`}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={finish}
      onPointerCancel={() => { draggingRef.current = false; setDragging(false) }}
      onLostPointerCapture={finish}
      onBlur={() => { draggingRef.current = false; setDragging(false) }}
      onKeyDown={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) keyboardInteractingRef.current = true
      }}
      onKeyUp={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return
        setPulse((current) => current + 1)
        if (keyboardInteractingRef.current) {
          keyboardInteractingRef.current = false
          onInteractionEnd?.(latestValueRef.current)
        }
      }}
      onChange={(event) => {
        const next = Number(event.target.value)
        latestValueRef.current = next
        onChange(next)
      }}
    />
  </span>
}
