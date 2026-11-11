import { Avatar, Style } from '@dicebear/core'
import { useState } from 'react'
import type { ReactElement } from 'react'
import loreleiNeutral from './lorelei-neutral.json' with { type: 'json' }

interface VoiceAvatarProps {
  voice?: { provider: string; id: string; model?: string | undefined } | undefined
  label: string
  fallback?: string | undefined
  compact?: boolean
}

const MAX_CACHED_AVATARS = 128
const sources = new Map<string, string | null>()
let style: Style | undefined

function avatarSource(seed: string): string | null {
  const cached = sources.get(seed)
  if (cached !== undefined) return cached

  let source: string | null = null
  try {
    style ??= new Style(loreleiNeutral)
    source = new Avatar(style, { seed }).toDataUri()
  } catch {
    // Keep the picker usable when an avatar cannot be generated.
  }

  if (sources.size >= MAX_CACHED_AVATARS) {
    const oldest = sources.keys().next().value
    if (oldest !== undefined) sources.delete(oldest)
  }
  sources.set(seed, source)
  return source
}

export function VoiceAvatar({ voice, label, fallback, compact = false }: VoiceAvatarProps): ReactElement {
  const id = voice?.id.trim()
  const seed = voice && id ? JSON.stringify([voice.provider, voice.model ?? '', id]) : null
  const [failedSeed, setFailedSeed] = useState<string | null>(null)
  const source = seed === null || seed === failedSeed ? null : avatarSource(seed)
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  if (source === null) {
    return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
  }
  const size = compact ? 20 : 36
  return <img key={seed} className={className} src={source} alt="" width={size} height={size} loading="lazy" onError={() => setFailedSeed(seed)} />
}
