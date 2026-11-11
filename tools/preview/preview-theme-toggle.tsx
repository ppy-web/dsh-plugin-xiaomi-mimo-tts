import { useLayoutEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import './preview-theme-toggle.css'

const SUN = [
  '.....#.....',
  '.#...#...#.',
  '..#.....#..',
  '....###....',
  '...#####...',
  '##.#####.##',
  '...#####...',
  '....###....',
  '..#.....#..',
  '.#...#...#.',
  '.....#.....',
]

const MOON = [
  '...##...#..',
  '..##...###.',
  '.###....#..',
  '.##........',
  '###......#.',
  '###......#.',
  '####....##.',
  '.########..',
  '.#######...',
  '..#####....',
  '...........',
]

function pixels(pattern: string[]) {
  return pattern.flatMap((row, y) => Array.from(row).flatMap((pixel, x) =>
    pixel === '#' ? [{ x: x - 5, y: y - 5, opacity: 1 }] : []))
}

const DAY_PIXELS = pixels(SUN)
const NIGHT_PIXELS = pixels(MOON)
const SCATTER_PIXELS = Array.from({ length: Math.max(DAY_PIXELS.length, NIGHT_PIXELS.length) + 8 }, (_, index) => {
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  const radius = 4 + index % 5
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, opacity: 0 }
})

const DAY = SCATTER_PIXELS.map((pixel, index) => DAY_PIXELS[index] ?? pixel)
const NIGHT = SCATTER_PIXELS.map((pixel, index) => NIGHT_PIXELS[index] ?? pixel)
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress
const clamp = (value: number) => Math.min(1, Math.max(0, value))

interface PreviewThemeToggleProps {
  dark: boolean
  label: string
  title: string
  onChange: (dark: boolean) => void
}

export function PreviewThemeToggle({ dark, label, title, onChange }: PreviewThemeToggleProps) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const knobRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const image = useRef({ pixels: dark ? NIGHT : DAY, shade: Number(dark) })
  const drag = useRef<{ pointerId: number; startX: number; position: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const from = image.current
    const target = dark ? NIGHT : DAY
    const shade = Number(dark)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0

    function draw(points: typeof DAY, tone: number) {
      if (!context) return
      image.current = { pixels: points, shade: tone }
      context.clearRect(0, 0, 72, 72)
      context.fillStyle = `rgb(${lerp(66, 249, tone)} ${lerp(51, 249, tone)} ${lerp(39, 255, tone)})`
      for (const { x, y, opacity } of points) {
        context.globalAlpha = opacity
        context.fillRect(34 + x * 4, 34 + y * 4, 3.4, 3.4)
      }
    }

    if (from.pixels === target || reducedMotion.matches) {
      draw(target, shade)
      return
    }

    const start = performance.now()
    function animate(now: number) {
      const progress = clamp((now - start) / 420)
      if (progress === 1 || reducedMotion.matches) {
        draw(target, shade)
        return
      }
      const scatter = Math.sin(Math.PI * progress) ** 2
      const points = target.map((pixel, index) => {
        const previous = from.pixels[index] ?? pixel
        const spread = SCATTER_PIXELS[index] ?? pixel
        return {
          x: lerp(lerp(previous.x, pixel.x, progress), spread.x, scatter * .8),
          y: lerp(lerp(previous.y, pixel.y, progress), spread.y, scatter * .8),
          opacity: lerp(lerp(previous.opacity, pixel.opacity, progress), .5, scatter),
        }
      })
      draw(points, lerp(from.shade, shade, Math.min(1, progress * 2)))
      frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [dark])

  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    const track = trackRef.current
    const knob = knobRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !track || !knob) return
    const distance = event.clientX - gesture.startX
    if (!gesture.active && Math.abs(distance) < 5) return
    if (!gesture.active) {
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.active = true
      suppressClick.current = true
      track.dataset.dragging = ''
    }
    const travel = track.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft
    gesture.position = clamp(Number(!dark) + distance / travel)
    track.style.setProperty('--preview-theme-position', String(gesture.position))
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current
    if (gesture?.pointerId !== event.pointerId) return
    drag.current = null
    const track = trackRef.current
    if (!gesture.active || !track) return
    delete track.dataset.dragging
    track.style.removeProperty('--preview-theme-position')
    if (event.type === 'pointerup') onChange(gesture.position < .5)
  }

  return <button type="button" className="preview-theme-toggle" role="switch" aria-checked={!dark}
    aria-label={label} title={title}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      suppressClick.current = false
      drag.current = { pointerId: event.pointerId, startX: event.clientX, position: Number(!dark), active: false }
    }}
    onPointerMove={movePointer} onPointerUp={finishPointer} onPointerCancel={finishPointer}
    onPointerLeave={event => {
      if (drag.current?.pointerId === event.pointerId && !drag.current.active) drag.current = null
    }}
    onLostPointerCapture={finishPointer}
    onClick={event => {
      if (event.detail === 0 || !suppressClick.current) onChange(!dark)
      suppressClick.current = false
    }}>
    <span ref={trackRef} className="preview-theme-track" aria-hidden="true">
      <span ref={knobRef} className="preview-theme-knob">
        <canvas ref={canvasRef} width={72} height={72} />
      </span>
    </span>
  </button>
}
