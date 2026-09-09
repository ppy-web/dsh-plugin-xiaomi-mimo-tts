import type { CSSProperties, ReactElement } from 'react'
import { useState } from 'react'

export interface EnergyVolumeSliderProps {
  value: number
  label: string
  disabled?: boolean
  onChange: (value: number) => void
}

function normalize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

/** A controlled, accessible volume slider with transient pointer feedback. */
export function EnergyVolumeSlider({ value, label, disabled = false, onChange }: EnergyVolumeSliderProps): ReactElement {
  const [dragging, setDragging] = useState(false)
  const [pulse, setPulse] = useState(0)
  const normalized = normalize(value)
  const percent = Math.round(normalized * 100)
  const finish = (): void => {
    if (!dragging) return
    setDragging(false)
    setPulse((current) => current + 1)
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
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true) }}
      onPointerUp={finish}
      onPointerCancel={() => { setDragging(false) }}
      onLostPointerCapture={() => { setDragging(false) }}
      onBlur={() => { setDragging(false) }}
      onKeyUp={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) setPulse((current) => current + 1)
      }}
      onChange={(event) => { onChange(Number(event.target.value) / 100) }}
    />
  </span>
}
