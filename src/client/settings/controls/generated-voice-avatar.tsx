import { Avatar, Style } from '@dicebear/core'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { TtsAvatarStyle } from '../../../shared.js'
import loreleiNeutral from './lorelei-neutral.json' with { type: 'json' }

export interface VoiceAvatarProps {
  voice?: { provider: string; id: string; model?: string | undefined } | undefined
  label: string
  fallback?: string | undefined
  avatarStyle?: TtsAvatarStyle
  compact?: boolean
}

const MAX_CACHED_AVATARS = 128
const sources = new Map<string, string | null>()
let style: Style | undefined

function avatarSource(seed: string, avatarStyle: TtsAvatarStyle): string | null {
  const key = JSON.stringify([seed, avatarStyle])
  const cached = sources.get(key)
  if (cached !== undefined) return cached

  let source: string | null = null
  try {
    style ??= new Style(loreleiNeutral)
    const hash = Array.from(seed).reduce((value, char) => (Math.imul(value, 31) + char.codePointAt(0)!) >>> 0, 0)
    const pastel = ['#fce0e8', '#ede4fa', '#fff0d0', '#e7e0fa', '#e0f2ee']
    const sunrise = [['#ffb9bc', '#ffd9ac'], ['#ffa8c1', '#ffc8b8'], ['#ffc7a7', '#ffd9bc'], ['#ffaebd', '#ffd4c1']]
    const options = avatarStyle === 'pastel' ? { backgroundColor: pastel[hash % pastel.length] }
        : avatarStyle === 'sunrise' ? { backgroundColor: sunrise[hash % sunrise.length], backgroundColorFill: 'linear' as const, backgroundColorOrder: 'fixed' as const }
          : {}
    source = new Avatar(style, { seed, ...options }).toDataUri()
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

export default function GeneratedVoiceAvatar({ voice, label, fallback, avatarStyle = 'default', compact = false }: VoiceAvatarProps): ReactElement {
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
  return <img key={imageKey} className={className} src={source} alt="" width={size} height={size} loading="lazy" onError={() => setFailedSeed(imageKey)} />
}
