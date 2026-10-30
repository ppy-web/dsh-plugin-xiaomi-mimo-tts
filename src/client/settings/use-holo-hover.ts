import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

const CARD_SELECTOR = '.xmimo-tts-character-toggle'
const HOLO_PROPERTIES = ['--xmimo-holo-x', '--xmimo-holo-y', '--xmimo-holo-bg-x', '--xmimo-holo-bg-y', '--xmimo-holo-rx', '--xmimo-holo-ry']

/** Track the stable hit areas, leaving the card faces free to tilt. */
export function useHoloHover(enabled: boolean): RefObject<HTMLDivElement | null> {
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = rowRef.current
    if (!enabled || !row) return

    const media = window.matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)')
    let active: HTMLElement | null = null
    let frame: number | undefined
    let clientX = 0
    let clientY = 0

    const reset = (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = undefined
      if (!active) return
      active.removeAttribute('data-xmimo-holo-active')
      for (const property of HOLO_PROPERTIES) active.style.removeProperty(property)
      active = null
    }

    const writable = (card: HTMLElement): boolean => !card.matches(':disabled') && !card.querySelector('input:disabled')

    const draw = (): void => {
      frame = undefined
      if (!active || !media.matches || document.hidden || !writable(active)) return reset()
      const rect = active.getBoundingClientRect()
      if (!rect.width || !rect.height) return reset()
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      active.style.setProperty('--xmimo-holo-x', `${x * 100}%`)
      active.style.setProperty('--xmimo-holo-y', `${y * 100}%`)
      active.style.setProperty('--xmimo-holo-bg-x', `${(1 - x) * 100}%`)
      active.style.setProperty('--xmimo-holo-bg-y', `${(1 - y) * 100}%`)
      active.style.setProperty('--xmimo-holo-rx', `${(0.5 - y) * 12}deg`)
      active.style.setProperty('--xmimo-holo-ry', `${(x - 0.5) * 12}deg`)
      active.setAttribute('data-xmimo-holo-active', '')
    }

    const track = (event: PointerEvent): void => {
      if (!media.matches || document.hidden || event.pointerType === 'touch') return reset()
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(CARD_SELECTOR) : null
      if (!card || !row.contains(card) || !writable(card)) return reset()
      if (card !== active) {
        reset()
        active = card
      }
      clientX = event.clientX
      clientY = event.clientY
      if (frame === undefined) frame = window.requestAnimationFrame(draw)
    }

    const leave = (event: PointerEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !active?.contains(event.relatedTarget)) reset()
    }

    row.addEventListener('pointerover', track)
    row.addEventListener('pointermove', track)
    row.addEventListener('pointerout', leave)
    row.addEventListener('pointerleave', reset)
    row.addEventListener('pointercancel', reset)
    media.addEventListener('change', reset)
    document.addEventListener('visibilitychange', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('resize', reset)
    window.addEventListener('scroll', reset, true)

    return () => {
      reset()
      row.removeEventListener('pointerover', track)
      row.removeEventListener('pointermove', track)
      row.removeEventListener('pointerout', leave)
      row.removeEventListener('pointerleave', reset)
      row.removeEventListener('pointercancel', reset)
      media.removeEventListener('change', reset)
      document.removeEventListener('visibilitychange', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', reset)
      window.removeEventListener('scroll', reset, true)
    }
  }, [enabled])

  return rowRef
}
