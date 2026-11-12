import type { ComponentProps, PointerEvent } from 'react'
import { useRef, useState } from 'react'

export interface SettingsRangeProps {
  value: number
  label: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  center?: number
  formatValue?: (value: number) => string
  onChange: (value: number) => void
  onInteractionStart?: () => void
  onInteractionEnd?: (value: number) => void
  onInteractionCancel?: () => void
}

const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

function snapRangeValue(value: number, min: number, max: number, step: number): number {
  const snapped = Number((min + Math.round((value - min) / step) * step).toPrecision(12))
  return Math.max(min, Math.min(max, snapped))
}

/** Allocate half the native track to either side of the chosen midpoint. */
export function centeredRangeScale(min: number, max: number, step: number, center: number) {
  const snap = (value: number): number => snapRangeValue(value, min, max, step)
  return {
    snap,
    position(value: number): number {
      return value <= center ? (value - min) / (2 * (center - min)) : 0.5 + (value - center) / (2 * (max - center))
    },
    value(position: number): number {
      return snap(position <= 0.5 ? min + (center - min) * (position * 2) : center + (max - center) * ((position - 0.5) * 2))
    },
  }
}

interface RangePointer {
  id: number
  start: number
  travel: number
  offset: number
  rtl: boolean
  value: number
}

export function useSettingsRange({ value, label, disabled = false, min = 0, max = 1, step = 0.01, center, formatValue, onChange, onInteractionStart, onInteractionEnd, onInteractionCancel }: SettingsRangeProps) {
  const lower = Number.isFinite(min) ? min : 0
  const upper = Number.isFinite(max) && max > lower ? max : lower + 1
  const increment = Number.isFinite(step) && step > 0 ? step : (upper - lower) / 100
  const bounded = Number.isFinite(value) ? Math.max(lower, Math.min(upper, value)) : upper
  const scale = center !== undefined && center > lower && center < upper ? centeredRangeScale(lower, upper, increment, center) : null
  const current = scale?.snap(bounded) ?? bounded
  const progress = scale?.position(current) ?? (current - lower) / (upper - lower)
  const percent = Math.round((current - lower) / (upper - lower) * 100)
  const readValue = (input: HTMLInputElement): number => scale?.value(input.valueAsNumber) ?? input.valueAsNumber
  const pointer = useRef<RangePointer | null>(null)
  const keys = useRef(new Set<string>())
  const [dragging, setDragging] = useState(false)
  const [pointerFocused, setPointerFocused] = useState(false)

  const clearPointer = (): void => {
    if (pointer.current === null) return
    pointer.current = null
    setDragging(false)
  }
  const cancelPointer = (event: PointerEvent<HTMLInputElement>): void => {
    if (event.pointerId !== pointer.current?.id) return
    clearPointer()
    onInteractionCancel?.()
  }
  const updatePointer = (drag: RangePointer, clientX: number): void => {
    if (drag.travel <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - drag.start - drag.offset) / drag.travel))
    const position = drag.rtl ? 1 - ratio : ratio
    const next = scale?.value(position) ?? snapRangeValue(lower + (upper - lower) * position, lower, upper, increment)
    if (next !== drag.value) {
      drag.value = next
      onChange(next)
    }
  }
  const inputProps = {
    type: 'range',
    min: scale ? 0 : lower,
    max: scale ? 1 : upper,
    step: scale ? 'any' : increment,
    value: scale ? progress : current,
    'aria-label': label,
    'aria-valuemin': scale ? lower : undefined,
    'aria-valuemax': scale ? upper : undefined,
    'aria-valuenow': scale ? current : undefined,
    'aria-valuetext': formatValue?.(current) ?? `${percent}%`,
    disabled,
    onPointerDown(event) {
      if (disabled || !event.isPrimary || event.button !== 0 || pointer.current !== null) return
      const input = event.currentTarget
      const rect = input.getBoundingClientRect()
      const style = getComputedStyle(input)
      const thumb = Math.min(rect.width, Number.parseFloat(style.getPropertyValue('--slider-thumb-size')) || 0)
      const start = rect.left + thumb / 2
      const travel = rect.width - thumb
      const rtl = style.direction === 'rtl'
      const distance = event.clientX - (start + travel * (rtl ? 1 - progress : progress))
      const drag: RangePointer = { id: event.pointerId, start, travel, rtl, offset: Math.abs(distance) <= thumb / 2 ? distance : 0, value: current }
      // Capturing the pointer can interrupt the browser's shadow thumb; handle this gesture here.
      event.preventDefault()
      setPointerFocused(true)
      input.focus({ preventScroll: true })
      input.setPointerCapture(event.pointerId)
      pointer.current = drag
      onInteractionStart?.()
      setDragging(true)
      if (event.pointerType === 'mouse' && drag.offset === 0) updatePointer(drag, event.clientX)
    },
    onPointerMove(event) {
      const drag = pointer.current
      if (!disabled && drag?.id === event.pointerId) updatePointer(drag, event.clientX)
    },
    onPointerUp(event) {
      const drag = pointer.current
      if (drag?.id !== event.pointerId) return
      if (!disabled) updatePointer(drag, event.clientX)
      clearPointer()
      if (disabled) onInteractionCancel?.()
      else onInteractionEnd?.(drag.value)
    },
    onPointerCancel: cancelPointer,
    onLostPointerCapture: cancelPointer,
    onBlur() {
      const wasEditing = pointer.current !== null || keys.current.size > 0
      clearPointer()
      keys.current.clear()
      setPointerFocused(false)
      if (wasEditing) onInteractionCancel?.()
    },
    onKeyDown(event) {
      if (disabled || !RANGE_KEYS.has(event.key)) return
      setPointerFocused(false)
      if (keys.current.size === 0 && pointer.current === null) onInteractionStart?.()
      keys.current.add(event.key)
      if (scale === null) return

      // Native pointer movement uses physical positions; keyboard steps use the stored value.
      event.preventDefault()
      const key = event.key
      const input = event.currentTarget
      const previous = readValue(input)
      const rtl = (key === 'ArrowLeft' || key === 'ArrowRight') && getComputedStyle(input).direction === 'rtl'
      const increase = key === 'ArrowUp' || key === 'PageUp' || (key === 'ArrowRight' && !rtl) || (key === 'ArrowLeft' && rtl)
      const keyStep = key === 'PageUp' || key === 'PageDown'
        ? Math.max(1, Math.round((upper - lower) / increment / 10)) * increment
        : increment
      const next = key === 'Home' ? lower : key === 'End' ? upper : scale.snap(previous + (increase ? keyStep : -keyStep))
      if (next !== previous) onChange(next)
    },
    onKeyUp(event) {
      if (!keys.current.delete(event.key) || keys.current.size > 0 || pointer.current !== null) return
      if (disabled) onInteractionCancel?.()
      else onInteractionEnd?.(readValue(event.currentTarget))
    },
    onChange(event) {
      const next = readValue(event.currentTarget)
      if (disabled || pointer.current !== null || !Number.isFinite(next)) return
      onChange(next)
      // Native range changes from assistive tools need no pointer or keyboard sequence.
      if (keys.current.size === 0) onInteractionEnd?.(next)
    },
  } satisfies ComponentProps<'input'>

  return { inputProps, progress, dragging: dragging && !disabled, pointerFocused }
}
