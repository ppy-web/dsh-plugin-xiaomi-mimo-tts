import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'
import type { HoloPreset, HoloRendererAdapter, SharedHoloRenderer } from './holo-card-renderer.js'

const CARD_SELECTOR = '.xmimo-tts-character-toggle'
const HOLO_CANVAS_SELECTOR = '.xmimo-tts-holo-canvas'
const HOLO_PROPERTIES = [
  '--xmimo-holo-x',
  '--xmimo-holo-y',
  '--xmimo-holo-bg-x',
  '--xmimo-holo-bg-y',
  '--xmimo-holo-rx',
  '--xmimo-holo-ry',
  '--xmimo-holo-lift',
  '--xmimo-holo-sx',
  '--xmimo-holo-sy',
  '--xmimo-holo-shadow-scale',
  '--xmimo-holo-awake',
  '--xmimo-holo-px',
  '--xmimo-holo-py',
] as const

const REST_LIGHT_X = 0.36
const REST_LIGHT_Y = 0.24
const FOIL_SILVER: readonly [number, number, number] = [0.78, 0.82, 0.88]

interface HoloHoverOptions {
  selector?: string
  allowDisabled?: boolean
  mouseOnly?: boolean
  tilt?: number
  hoverScale?: number
  /** Optional WebGL2 holo foil renderer; omitted by CSS-only tilt surfaces so the shader stays out of the entry chunk. */
  holo?: HoloRendererAdapter
}

interface CardSpring {
  tiltX: number
  tiltY: number
  tiltVX: number
  tiltVY: number
  lightX: number
  lightY: number
  lightVX: number
  lightVY: number
  lift: number
  liftV: number
  awake: number
  awakeV: number
  targetX: number
  targetY: number
  pointerX: number
  pointerY: number
  inside: boolean
  calm: number
  settled: boolean
  canvas: HTMLCanvasElement | null | undefined
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function spring(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): [number, number] {
  const nextVelocity = velocity + ((target - value) * stiffness - velocity * damping) * dt
  return [value + nextVelocity * dt, nextVelocity]
}

function createCardSpring(): CardSpring {
  return {
    tiltX: 0,
    tiltY: 0,
    tiltVX: 0,
    tiltVY: 0,
    lightX: REST_LIGHT_X,
    lightY: REST_LIGHT_Y,
    lightVX: 0,
    lightVY: 0,
    lift: 1,
    liftV: 0,
    awake: 0,
    awakeV: 0,
    targetX: 0,
    targetY: 0,
    pointerX: REST_LIGHT_X,
    pointerY: REST_LIGHT_Y,
    inside: false,
    calm: 1,
    settled: true,
    canvas: undefined,
    width: 0,
    height: 0,
  }
}

function isDarkScheme(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  const root = document.documentElement
  if (root.dataset.theme === 'dark' || document.body?.hasAttribute('data-ds-dark-theme')) return true
  if (root.dataset.theme === 'light') return false
  try {
    return window.getComputedStyle(root).colorScheme.includes('dark')
  } catch {
    return false
  }
}

function cardPreset(card: HTMLElement, holo?: HoloRendererAdapter): HoloPreset {
  const value = card.dataset.xmimoHoloPreset
  return holo?.isPreset(value) ? value : 'bursts'
}

function clearCard(card: HTMLElement): void {
  card.removeAttribute('data-xmimo-holo-active')
  card.removeAttribute('data-xmimo-holo-spring')
  card.removeAttribute('data-xmimo-holo-gl')
  for (const property of HOLO_PROPERTIES) card.style.removeProperty(property)
  const canvas = card.querySelector<HTMLCanvasElement>(HOLO_CANVAS_SELECTOR)
  const ctx = canvas?.getContext('2d')
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}

/**
 * Track stable card hit areas with React Bits-style damped spring physics,
 * tilt-following dynamic shadow, portrait parallax, and a shared WebGL2
 * holographic foil overlay (falling back cleanly to CSS when WebGL2 is absent).
 */
export function useHoloHover(
  enabled: boolean,
  { selector = CARD_SELECTOR, allowDisabled = false, mouseOnly = false, tilt = 12, hoverScale = 1.032, holo }: HoloHoverOptions = {},
): RefObject<HTMLDivElement | null> {
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = rowRef.current
    if (!enabled || !row) return

    const media = window.matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)')
    const darkSchemeMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const springs = new Map<HTMLElement, CardSpring>()
    let renderer: SharedHoloRenderer | null = null
    let hovered: HTMLElement | null = null
    let frame = 0
    let last = 0
    let alive = true
    let dark = isDarkScheme()

    const writable = (card: HTMLElement): boolean => !card.matches(':disabled') && !card.querySelector('input:disabled')

    const cards = (): HTMLElement[] => Array.from(row.querySelectorAll<HTMLElement>(selector))

    const getCanvas = (card: HTMLElement, state: CardSpring): HTMLCanvasElement | null => {
      if (state.canvas === undefined || (state.canvas !== null && !card.contains(state.canvas))) {
        state.canvas = card.querySelector<HTMLCanvasElement>(HOLO_CANVAS_SELECTOR)
      }
      return state.canvas
    }

    const measureCanvas = (card: HTMLElement, state: CardSpring): void => {
      const canvas = getCanvas(card, state)
      if (!canvas) {
        state.width = 0
        state.height = 0
        return
      }
      state.width = canvas.clientWidth
      state.height = canvas.clientHeight
    }

    const ensureRenderer = (): SharedHoloRenderer | null => {
      if (!holo) return null
      if (renderer && !renderer.isLost()) return renderer
      if (!row.querySelector(HOLO_CANVAS_SELECTOR)) return null
      renderer = holo.acquire()
      return renderer
    }

    const renderCanvas = (card: HTMLElement, state: CardSpring): void => {
      if (!holo) return
      const canvas = getCanvas(card, state)
      if (!canvas) return
      const isOn = card.classList.contains('xmimo-tts-character-toggle-on')
      const restAwake = isOn ? (dark ? 0.22 : 0.32) : 0
      const tiltAwake = clamp(Math.hypot(state.tiltX, state.tiltY) / Math.max(1, tilt), 0, 1)
      const effectiveAwake = Math.max(restAwake, clamp(state.awake * 0.88 + tiltAwake * 0.32, 0, 1))
      if (effectiveAwake <= 0.001) {
        if (card.hasAttribute('data-xmimo-holo-gl')) {
          const ctx = canvas.getContext('2d')
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
          card.removeAttribute('data-xmimo-holo-gl')
        }
        return
      }
      const glRenderer = ensureRenderer()
      if (!glRenderer) return
      if (!state.width || !state.height) measureCanvas(card, state)
      if (!state.width || !state.height) return
      const drawn = glRenderer.renderTo(canvas, {
        preset: cardPreset(card, holo),
        tiltX: state.tiltX,
        tiltY: state.tiltY,
        lightX: state.lightX,
        lightY: state.lightY,
        awake: effectiveAwake,
        intensity: isOn ? (dark ? 0.68 : 0.82) : (dark ? 0.36 : 0.5),
        edgeSparkle: isOn ? (dark ? 0.45 : 0.48) : (dark ? 0.26 : 0.3),
        glare: isOn ? 0.56 : 0.42,
        radius: 16,
        dark,
        foilColor: FOIL_SILVER,
        clientWidth: state.width,
        clientHeight: state.height,
      })
      if (drawn && !card.hasAttribute('data-xmimo-holo-gl')) card.setAttribute('data-xmimo-holo-gl', '')
    }

    const paintRestAll = (): void => {
      if (!alive || !media.matches || document.hidden) return
      dark = isDarkScheme()
      const list = cards()
      const entries: Array<[HTMLElement, CardSpring]> = []
      // Batch DOM measurements before any canvas/style writes to avoid reflow thrashing.
      for (const card of list) {
        if (!allowDisabled && !writable(card)) continue
        const state = springs.get(card) ?? createCardSpring()
        springs.set(card, state)
        measureCanvas(card, state)
        entries.push([card, state])
      }
      for (const [card, state] of entries) renderCanvas(card, state)
    }

    const applyStyle = (card: HTMLElement, state: CardSpring, moving: boolean): void => {
      const style = card.style
      if (!card.hasAttribute('data-xmimo-holo-gl')) {
        style.setProperty('--xmimo-holo-x', `${(state.lightX * 100).toFixed(2)}%`)
        style.setProperty('--xmimo-holo-y', `${(state.lightY * 100).toFixed(2)}%`)
        style.setProperty('--xmimo-holo-bg-x', `${((1 - state.lightX) * 100).toFixed(2)}%`)
        style.setProperty('--xmimo-holo-bg-y', `${((1 - state.lightY) * 100).toFixed(2)}%`)
      }
      style.setProperty('--xmimo-holo-rx', `${state.tiltX.toFixed(3)}deg`)
      style.setProperty('--xmimo-holo-ry', `${state.tiltY.toFixed(3)}deg`)
      style.setProperty('--xmimo-holo-lift', state.lift.toFixed(4))
      style.setProperty('--xmimo-holo-sx', `${(-state.tiltY * 0.7).toFixed(2)}px`)
      style.setProperty('--xmimo-holo-sy', `${(state.tiltX * 0.7).toFixed(2)}px`)
      style.setProperty('--xmimo-holo-shadow-scale', (0.9 + (state.lift - 1) * 1.6).toFixed(4))
      style.setProperty('--xmimo-holo-awake', state.awake.toFixed(3))
      style.setProperty('--xmimo-holo-px', `${(state.tiltY * 0.2).toFixed(2)}px`)
      style.setProperty('--xmimo-holo-py', `${(-state.tiltX * 0.2).toFixed(2)}px`)
      if (state.inside) {
        if (!card.hasAttribute('data-xmimo-holo-active')) card.setAttribute('data-xmimo-holo-active', '')
      } else if (card.hasAttribute('data-xmimo-holo-active')) {
        card.removeAttribute('data-xmimo-holo-active')
      }
      if (moving || state.inside) {
        if (!card.hasAttribute('data-xmimo-holo-spring')) card.setAttribute('data-xmimo-holo-spring', '')
      } else if (card.hasAttribute('data-xmimo-holo-spring')) {
        card.removeAttribute('data-xmimo-holo-spring')
      }
    }

    const resetAll = (): void => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      hovered = null
      for (const card of springs.keys()) clearCard(card)
      springs.clear()
    }

    const tick = (now: number): void => {
      frame = 0
      if (!alive || !media.matches || document.hidden) {
        resetAll()
        return
      }
      const dt = clamp((now - last) / 1000, 1 / 240, 1 / 30)
      last = now
      const steps = Math.ceil(dt / (1 / 240))
      const stepDt = dt / steps
      let anyActive = false

      for (const [card, state] of springs) {
        if (!row.contains(card) || (!allowDisabled && !writable(card))) {
          clearCard(card)
          springs.delete(card)
          continue
        }
        // Skip resting siblings so hovering one card does not repaint or restyle the other three.
        if (state.settled && !state.inside) continue

        const targetTiltX = state.inside ? state.targetX : 0
        const targetTiltY = state.inside ? state.targetY : 0
        const targetLightX = state.inside ? state.pointerX : REST_LIGHT_X
        const targetLightY = state.inside ? state.pointerY : REST_LIGHT_Y
        const targetLift = state.inside ? hoverScale : 1
        const targetAwake = state.inside ? 1 : 0

        for (let i = 0; i < steps; i++) {
          ;[state.tiltX, state.tiltVX] = spring(state.tiltX, state.tiltVX, targetTiltX, 150, 16, stepDt)
          ;[state.tiltY, state.tiltVY] = spring(state.tiltY, state.tiltVY, targetTiltY, 150, 16, stepDt)
          ;[state.lightX, state.lightVX] = spring(state.lightX, state.lightVX, targetLightX, 220, 30, stepDt)
          ;[state.lightY, state.lightVY] = spring(state.lightY, state.lightVY, targetLightY, 220, 30, stepDt)
          ;[state.lift, state.liftV] = spring(state.lift, state.liftV, targetLift, 320, 30, stepDt)
          ;[state.awake, state.awakeV] = spring(state.awake, state.awakeV, targetAwake, 240, 28, stepDt)
        }

        const motion =
          Math.abs(state.tiltVX)
          + Math.abs(state.tiltVY)
          + Math.abs(state.liftV) * 40
          + (Math.abs(state.lightVX) + Math.abs(state.lightVY)) * 60
          + Math.abs(state.awakeV) * 20
          + Math.abs(state.tiltX - targetTiltX)
          + Math.abs(state.tiltY - targetTiltY)
          + Math.abs(state.awake - targetAwake) * 10

        state.calm = motion > 0.025 ? 0 : state.calm + dt
        const moving = state.inside || state.calm <= 0.3

        if (!moving) {
          state.tiltX = 0
          state.tiltY = 0
          state.tiltVX = 0
          state.tiltVY = 0
          state.lightX = REST_LIGHT_X
          state.lightY = REST_LIGHT_Y
          state.lightVX = 0
          state.lightVY = 0
          state.lift = 1
          state.liftV = 0
          state.awake = 0
          state.awakeV = 0
          state.settled = true
        }

        renderCanvas(card, state)
        applyStyle(card, state, moving)
        if (moving) anyActive = true
      }

      if (anyActive) frame = window.requestAnimationFrame(tick)
    }

    const wake = (): void => {
      if (frame || !alive || !media.matches || document.hidden) return
      last = performance.now()
      frame = window.requestAnimationFrame(tick)
    }

    const releaseHover = (card: HTMLElement | null): void => {
      if (!card) return
      const state = springs.get(card)
      if (!state) return
      state.inside = false
      state.calm = 0
      state.settled = false
      wake()
    }

    const track = (event: PointerEvent): void => {
      if (!media.matches || document.hidden || (mouseOnly ? event.pointerType !== 'mouse' : event.pointerType === 'touch')) {
        releaseHover(hovered)
        hovered = null
        return
      }
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null
      if (!card || !row.contains(card) || (!allowDisabled && !writable(card))) {
        releaseHover(hovered)
        hovered = null
        return
      }
      if (hovered && hovered !== card) releaseHover(hovered)
      hovered = card

      const rect = card.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
      const state = springs.get(card) ?? createCardSpring()
      springs.set(card, state)
      if (!state.width || !state.height) measureCanvas(card, state)
      state.inside = true
      state.settled = false
      state.pointerX = x
      state.pointerY = y
      state.targetX = (0.5 - y) * 2 * tilt
      state.targetY = (x - 0.5) * 2 * tilt
      state.calm = 0
      wake()
    }

    const leave = (event: PointerEvent): void => {
      if (!hovered) return
      if (!(event.relatedTarget instanceof Node) || !hovered.contains(event.relatedTarget)) {
        releaseHover(hovered)
        hovered = null
      }
    }

    const leaveRow = (): void => {
      releaseHover(hovered)
      hovered = null
    }

    let warmedUp = false
    let restFrame = 0
    let idleHandle: number | null = null
    let idleUsesRic = false

    const cancelDeferredPaint = (): void => {
      if (restFrame) {
        window.cancelAnimationFrame(restFrame)
        restFrame = 0
      }
      if (idleHandle !== null) {
        if (idleUsesRic && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
        else window.clearTimeout(idleHandle)
        idleHandle = null
      }
    }

    const scheduleRestPaint = (immediate = false): void => {
      if (!holo || !alive || !media.matches || document.hidden) return
      if (!warmedUp && !immediate) {
        if (idleHandle !== null) return
        if (typeof window.requestIdleCallback === 'function') {
          idleUsesRic = true
          idleHandle = window.requestIdleCallback(() => {
            idleHandle = null
            warmedUp = true
            paintRestAll()
          }, { timeout: 280 })
        } else {
          idleUsesRic = false
          idleHandle = window.setTimeout(() => {
            idleHandle = null
            warmedUp = true
            paintRestAll()
          }, 90)
        }
        return
      }
      if (restFrame) return
      restFrame = window.requestAnimationFrame(() => {
        restFrame = 0
        warmedUp = true
        paintRestAll()
      })
    }

    const handleMediaChange = (): void => {
      if (!media.matches) {
        cancelDeferredPaint()
        resetAll()
      } else {
        scheduleRestPaint()
      }
    }

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        cancelDeferredPaint()
        resetAll()
      } else {
        scheduleRestPaint()
      }
    }

    const handleThemeChange = (): void => {
      const nextDark = isDarkScheme()
      if (nextDark === dark) return
      dark = nextDark
      if (warmedUp) scheduleRestPaint(true)
    }

    // Repaint resting holo luster when card sizes, ON/OFF states, or theme attributes change,
    // without blocking initial page paint with synchronous WebGL2 shader compilation.
    const resizeObserver = holo && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        for (const state of springs.values()) { state.width = 0; state.height = 0 }
        if (warmedUp) scheduleRestPaint(true)
      })
      : null
    resizeObserver?.observe(row)

    const mutationObserver = holo && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(records => {
        const themeChanged = records.some(record => record.target === document.documentElement || record.target === document.body)
        if (themeChanged) {
          handleThemeChange()
          return
        }
        if (warmedUp) scheduleRestPaint(true)
      })
      : null
    if (mutationObserver) {
      mutationObserver.observe(row, { attributes: true, subtree: true, attributeFilter: ['class'] })
      mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
      if (document.body) {
        mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }
    }

    const trackWithWarmup = (event: PointerEvent): void => {
      if (!warmedUp) {
        cancelDeferredPaint()
        warmedUp = true
      }
      track(event)
    }

    row.addEventListener('pointerover', trackWithWarmup)
    row.addEventListener('pointermove', trackWithWarmup)
    row.addEventListener('pointerout', leave)
    row.addEventListener('pointerleave', leaveRow)
    row.addEventListener('pointercancel', leaveRow)
    media.addEventListener('change', handleMediaChange)
    darkSchemeMedia?.addEventListener('change', handleThemeChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', leaveRow)

    scheduleRestPaint()

    return () => {
      alive = false
      cancelDeferredPaint()
      resetAll()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      row.removeEventListener('pointerover', trackWithWarmup)
      row.removeEventListener('pointermove', trackWithWarmup)
      row.removeEventListener('pointerout', leave)
      row.removeEventListener('pointerleave', leaveRow)
      row.removeEventListener('pointercancel', leaveRow)
      media.removeEventListener('change', handleMediaChange)
      darkSchemeMedia?.removeEventListener('change', handleThemeChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', leaveRow)
      holo?.release(renderer)
      renderer = null
    }
  }, [enabled, selector, allowDisabled, mouseOnly, tilt, hoverScale, holo])

  return rowRef
}
