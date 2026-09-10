import type { CSSProperties, PointerEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

export interface EnergyVolumeSliderProps {
  value: number
  label: string
  disabled?: boolean
  onChange: (value: number) => void
  onInteractionEnd?: (value: number) => void
}

function normalize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

/** A controlled, accessible volume slider with transient pointer feedback. */
export function EnergyVolumeSlider({ value, label, disabled = false, onChange, onInteractionEnd }: EnergyVolumeSliderProps): ReactElement {
  const [dragging, setDragging] = useState(false)
  const [pulse, setPulse] = useState(0)
  const draggingRef = useRef(false)
  const keyboardInteractingRef = useRef(false)
  const latestValueRef = useRef(normalize(value))
  const normalized = normalize(value)
  const percent = Math.round(normalized * 100)
  useEffect(() => {
    if (!draggingRef.current) latestValueRef.current = normalized
  }, [normalized])
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
      {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ '--dot': index, opacity: index / 24 < normalized ? .7 : .15 } as CSSProperties} />)}
    </span>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={percent}
      aria-label={label}
      aria-valuetext={`${percent}%`}
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
        const next = Number(event.target.value) / 100
        latestValueRef.current = next
        onChange(next)
      }}
    />
  </span>
}
