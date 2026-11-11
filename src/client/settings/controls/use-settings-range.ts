import type { ComponentProps, PointerEvent } from 'react'
import { useRef, useState } from 'react'

export interface SettingsRangeProps {
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

const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

export function useSettingsRange({ value, label, disabled = false, min = 0, max = 1, step = 0.01, formatValue, onChange, onInteractionEnd }: SettingsRangeProps) {
  const lower = Number.isFinite(min) ? min : 0
  const upper = Number.isFinite(max) && max > lower ? max : lower + 1
  const increment = Number.isFinite(step) && step > 0 ? step : (upper - lower) / 100
  const current = Number.isFinite(value) ? Math.max(lower, Math.min(upper, value)) : upper
  const progress = (current - lower) / (upper - lower)
  const percent = Math.round(progress * 100)
  const pointerId = useRef<number | null>(null)
  const keys = useRef(new Set<string>())
  const [dragging, setDragging] = useState(false)

  const clearPointer = (): void => {
    if (pointerId.current === null) return
    pointerId.current = null
    setDragging(false)
  }
  const cancelPointer = (event: PointerEvent<HTMLInputElement>): void => {
    if (event.pointerId === pointerId.current) clearPointer()
  }
  const inputProps = {
    type: 'range',
    min: lower,
    max: upper,
    step: increment,
    value: current,
    'aria-label': label,
    'aria-valuetext': formatValue?.(current) ?? `${percent}%`,
    disabled,
    onPointerDown(event) {
      if (disabled || !event.isPrimary || event.button !== 0 || pointerId.current !== null) return
      event.currentTarget.setPointerCapture(event.pointerId)
      pointerId.current = event.pointerId
      setDragging(true)
    },
    onPointerUp(event) {
      if (event.pointerId !== pointerId.current) return
      clearPointer()
      if (!disabled) onInteractionEnd?.(event.currentTarget.valueAsNumber)
    },
    onPointerCancel: cancelPointer,
    onLostPointerCapture: cancelPointer,
    onBlur() {
      clearPointer()
      keys.current.clear()
    },
    onKeyDown(event) {
      if (!disabled && RANGE_KEYS.has(event.key)) keys.current.add(event.key)
    },
    onKeyUp(event) {
      if (keys.current.delete(event.key) && keys.current.size === 0 && !disabled) {
        onInteractionEnd?.(event.currentTarget.valueAsNumber)
      }
    },
    onChange(event) {
      onChange(event.currentTarget.valueAsNumber)
    },
  } satisfies ComponentProps<'input'>

  return { inputProps, progress, dragging: dragging && !disabled }
}
