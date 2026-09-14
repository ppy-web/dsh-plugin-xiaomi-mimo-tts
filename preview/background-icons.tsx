import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  TTS_API_KEY_WHALE_ASSET_ROUTE,
  TTS_MIXER_WHALE_ASSET_ROUTE,
  TTS_PREVIEW_WHALE_ASSET_ROUTE,
  TTS_SOUND_EFFECT_CUES_ASSET_ROUTE,
  TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE,
  TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE,
  TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
} from '../src/shared.js'
import { hostRoute } from '../src/client/host-route.js'

interface BackgroundIcon {
  route: string
  columns: number
  rows: number
  index: number
  ratio: number
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
}

// Fixed positions keep the background calm during React rerenders while still
// giving each supplied UI illustration a scattered, poster-like placement.
const BACKGROUND_ICONS: readonly BackgroundIcon[] = [
  { route: TTS_TOGGLE_CHARACTER_ASSET_ROUTE, columns: 2, rows: 2, index: 0, ratio: 153 / 140, x: 4, y: 10, size: 112, rotation: -28, opacity: .14 },
  { route: TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 153 / 140, x: 90, y: 8, size: 110, rotation: 22, opacity: .13 },
  { route: TTS_API_KEY_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 47, y: 6, size: 68, rotation: -14, opacity: .1 },
  { route: TTS_MIXER_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 94, y: 29, size: 82, rotation: 26, opacity: .11 },
  { route: TTS_PREVIEW_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 7, y: 47, size: 78, rotation: 18, opacity: .11 },
  { route: TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 78, y: 58, size: 88, rotation: -23, opacity: .1 },
  { route: TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, columns: 5, rows: 1, index: 2, ratio: 48 / 80, x: 35, y: 91, size: 118, rotation: -12, opacity: .07 },
  { route: TTS_TOGGLE_CHARACTER_ASSET_ROUTE, columns: 2, rows: 2, index: 3, ratio: 153 / 140, x: 57, y: 34, size: 92, rotation: 16, opacity: .07 },
  { route: TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 153 / 140, x: 17, y: 32, size: 94, rotation: 28, opacity: .08 },
  { route: TTS_API_KEY_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 90, y: 82, size: 60, rotation: -31, opacity: .08 },
  { route: TTS_MIXER_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 33, y: 19, size: 58, rotation: 27, opacity: .07 },
  { route: TTS_PREVIEW_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 66, y: 13, size: 72, rotation: -25, opacity: .08 },
  { route: TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 22, y: 78, size: 68, rotation: 12, opacity: .07 },
  { route: TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, columns: 5, rows: 1, index: 4, ratio: 48 / 80, x: 84, y: 43, size: 102, rotation: 9, opacity: .07 },
  { route: TTS_TOGGLE_CHARACTER_ASSET_ROUTE, columns: 2, rows: 2, index: 1, ratio: 153 / 140, x: 27, y: 6, size: 74, rotation: -19, opacity: .08 },
  { route: TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 153 / 140, x: 53, y: 24, size: 70, rotation: 17, opacity: .07 },
  { route: TTS_TOGGLE_CHARACTER_ASSET_ROUTE, columns: 2, rows: 2, index: 2, ratio: 153 / 140, x: 75, y: 31, size: 80, rotation: -34, opacity: .06 },
  { route: TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 153 / 140, x: 9, y: 84, size: 76, rotation: 23, opacity: .06 },
  { route: TTS_API_KEY_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 45, y: 53, size: 54, rotation: -29, opacity: .06 },
  { route: TTS_MIXER_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 95, y: 92, size: 58, rotation: 18, opacity: .06 },
  { route: TTS_PREVIEW_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 0, ratio: 1, x: 45, y: 77, size: 60, rotation: 32, opacity: .06 },
  { route: TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE, columns: 2, rows: 1, index: 1, ratio: 1, x: 9, y: 23, size: 64, rotation: -17, opacity: .06 },
  { route: TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, columns: 5, rows: 1, index: 0, ratio: 48 / 80, x: 58, y: 88, size: 94, rotation: -21, opacity: .05 },
  { route: TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, columns: 5, rows: 1, index: 3, ratio: 48 / 80, x: 12, y: 61, size: 90, rotation: 14, opacity: .05 },
]

const SCROLL_ROTATION_FACTOR = .22

function scrollDistance(sources: readonly (Window | HTMLElement)[]): number {
  return sources.reduce((distance, source) => distance + ('scrollY' in source ? source.scrollY : source.scrollTop), 0)
}

function useScrollRotation(): number {
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const panes = Array.from(document.querySelectorAll<HTMLElement>('.preview-manual, .preview-settings-pane'))
    const sources: Array<Window | HTMLElement> = [window, ...panes]
    let frame = 0
    const update = (): void => {
      frame = 0
      setRotation((scrollDistance(sources) * SCROLL_ROTATION_FACTOR) % 360)
    }
    const onScroll = (): void => {
      if (frame !== 0) return
      frame = requestAnimationFrame(update)
    }

    sources.forEach((source) => { source.addEventListener('scroll', onScroll, { passive: true }) })
    return () => {
      sources.forEach((source) => { source.removeEventListener('scroll', onScroll) })
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  return rotation
}

export function PreviewBackground(): ReactElement {
  const scrollRotation = useScrollRotation()

  return <div className="preview-background" style={{ '--preview-scroll-rotation': `${scrollRotation}deg` } as CSSProperties} aria-hidden="true">
    {BACKGROUND_ICONS.map((icon, index) => <span
      className="preview-background-icon"
      key={`${icon.route}-${index}`}
      style={{
        '--preview-icon-x': `${icon.x}%`,
        '--preview-icon-y': `${icon.y}%`,
        '--preview-icon-size': `${icon.size}px`,
        '--preview-icon-ratio': icon.ratio,
        '--preview-icon-rotation': `${icon.rotation}deg`,
        '--preview-icon-opacity': icon.opacity,
        '--preview-sprite-image': `url(${hostRoute(icon.route)})`,
        '--preview-sprite-size': `${icon.columns * 100}% ${icon.rows * 100}%`,
        '--preview-sprite-position': `${icon.columns === 1 ? 0 : (icon.index % icon.columns) * 100 / (icon.columns - 1)}% ${icon.rows === 1 ? 0 : Math.floor(icon.index / icon.columns) * 100 / (icon.rows - 1)}%`,
      } as CSSProperties}
    >
      <span className="preview-background-icon-art" />
    </span>)}
  </div>
}
