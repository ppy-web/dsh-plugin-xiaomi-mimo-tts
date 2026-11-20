import { createContext, lazy, Suspense, useContext } from 'react'
import type { TtsAvatarStyle } from '../../../shared.js'

export const AvatarStyleContext = createContext<TtsAvatarStyle>('default')
import type { ReactElement } from 'react'
import type { VoiceAvatarProps } from './generated-voice-avatar.js'

function FallbackAvatar({ label, fallback, compact = false }: VoiceAvatarProps): ReactElement {
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
}

const GeneratedVoiceAvatar = lazy(async () => {
  try {
    return await import('./generated-voice-avatar.js')
  } catch {
    return { default: FallbackAvatar }
  }
})

export function VoiceAvatar(props: VoiceAvatarProps): ReactElement {
  const style = useContext(AvatarStyleContext)
  if (!props.voice?.id.trim()) return <FallbackAvatar {...props} />
  return <Suspense fallback={<FallbackAvatar {...props} />}><GeneratedVoiceAvatar {...props} avatarStyle={props.avatarStyle ?? style} /></Suspense>
}
