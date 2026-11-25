import { memo, useState } from 'react'
import type { ReactElement } from 'react'
import type { TtsAvatarStyle } from '../../shared.js'
import loreleiNeutral from './lorelei-neutral.json' with { type: 'json' }

export interface VoiceAvatarProps {
  voice?: { provider: string; id: string; model?: string | undefined } | undefined
  label: string
  fallback?: string | undefined
  avatarStyle?: TtsAvatarStyle
  compact?: boolean
}

interface LoreleiPathElement {
  name: string
  type: string
  attributes: Record<string, unknown>
}

interface LoreleiComponent {
  probability?: number
  variants: Record<string, { elements?: readonly LoreleiPathElement[] }>
}

const MAX_CACHED_AVATARS = 512
const sources = new Map<string, string | null>()

interface CompiledLayer {
  probability: number | undefined
  transform: string
  variants: readonly string[]
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

function resolveColor(fill: unknown): string {
  if (typeof fill === 'string') return fill
  if (fill && typeof fill === 'object' && 'name' in fill) {
    const colorName = (fill as { name: string }).name
    const colors = loreleiNeutral.colors as Record<string, { values?: readonly string[] } | undefined>
    return colors[colorName]?.values?.[0] ?? '#000000'
  }
  return '#000000'
}

// Precompile layer variants once so opening large voice pickers (e.g. 200+ Edge voices)
// concatenates pre-escaped SVG fragments instead of re-walking JSON metadata per voice.
const COMPILED_LAYERS: readonly CompiledLayer[] = (() => {
  const components = loreleiNeutral.components as Record<string, LoreleiComponent | undefined>
  const compiled: CompiledLayer[] = []
  for (const layer of loreleiNeutral.canvas.elements) {
    const component = components[layer.name]
    if (!component) continue
    const variantKeys = Object.keys(component.variants)
    if (variantKeys.length === 0) continue
    const transform = typeof layer.attributes?.transform === 'string'
      ? ` transform="${escapeXmlAttr(layer.attributes.transform)}"`
      : ''
    const variants = variantKeys.map(key => {
      const variant = component.variants[key]
      if (!variant?.elements?.length) return ''
      return variant.elements.map(element => {
        if (element.name !== 'path') return ''
        const attrs = Object.entries(element.attributes)
          .map(([attr, raw]) => {
            const val = attr === 'fill' ? resolveColor(raw) : String(raw)
            return `${attr}="${escapeXmlAttr(val)}"`
          })
          .join(' ')
        return `<path ${attrs}/>`
      }).join('')
    })
    compiled.push({ probability: component.probability, transform, variants })
  }
  return compiled
})()

function hashSeed(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createPrng(initial: number): () => number {
  let state = initial || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PASTEL_COLORS = ['#fce0e8', '#ede4fa', '#fff0d0', '#e7e0fa', '#e0f2ee'] as const
const SUNRISE_COLORS = [['#ffb9bc', '#ffd9ac'], ['#ffa8c1', '#ffc8b8'], ['#ffc7a7', '#ffd9bc'], ['#ffaebd', '#ffd4c1']] as const

function renderLoreleiSvg(seed: string, avatarStyle: TtsAvatarStyle): string {
  const hash = hashSeed(seed)
  const rand = createPrng(hash)
  const parts: string[] = []
  for (const layer of COMPILED_LAYERS) {
    const roll = rand()
    const pick = rand()
    if (layer.probability !== undefined && roll * 100 >= layer.probability) continue
    const paths = layer.variants[Math.floor(pick * layer.variants.length)]!
    if (!paths) continue
    parts.push(`<g${layer.transform}>${paths}</g>`)
  }

  let background = ''
  if (avatarStyle === 'pastel') {
    const color = PASTEL_COLORS[hash % PASTEL_COLORS.length]!
    background = `<rect width="600" height="600" fill="${color}"/>`
  } else if (avatarStyle === 'sunrise') {
    const [start, end] = SUNRISE_COLORS[hash % SUNRISE_COLORS.length]!
    background = `<defs><linearGradient id="xmimo-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${start}"/><stop offset="100%" stop-color="${end}"/></linearGradient></defs><rect width="600" height="600" fill="url(#xmimo-bg)"/>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" fill="none" shape-rendering="auto">${background}${parts.join('')}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function avatarSource(seed: string, avatarStyle: TtsAvatarStyle): string | null {
  const key = JSON.stringify([seed, avatarStyle])
  const cached = sources.get(key)
  if (cached !== undefined) {
    // Refresh recency for true LRU eviction.
    sources.delete(key)
    sources.set(key, cached)
    return cached
  }

  let source: string | null = null
  try {
    source = renderLoreleiSvg(seed, avatarStyle)
  } catch {
    // Keep the picker usable when an avatar cannot be generated.
  }

  if (sources.size >= MAX_CACHED_AVATARS) {
    const oldest = sources.keys().next().value
    if (oldest !== undefined) sources.delete(oldest)
  }
  sources.set(key, source)
  return source
}

const GeneratedVoiceAvatar = memo(function GeneratedVoiceAvatar({ voice, label, fallback, avatarStyle = 'default', compact = false }: VoiceAvatarProps): ReactElement {
  const id = voice?.id.trim()
  const seed = voice && id ? JSON.stringify([voice.provider, voice.model ?? '', id]) : null
  const [failedSeed, setFailedSeed] = useState<string | null>(null)
  const imageKey = JSON.stringify([seed, avatarStyle])
  const source = seed === null || imageKey === failedSeed ? null : avatarSource(seed, avatarStyle)
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  if (source === null) {
    return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
  }
  const size = compact ? 20 : 36
  return <img key={imageKey} className={className} src={source} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailedSeed(imageKey)} />
})

export default GeneratedVoiceAvatar
