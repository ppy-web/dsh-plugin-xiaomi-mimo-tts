import { createContext, lazy, memo, Suspense, useContext } from 'react'
import type { ComponentType, ReactElement } from 'react'
import type { TtsAvatarStyle } from '../../shared.js'
import type { VoiceAvatarProps } from './generated-voice-avatar.js'

export const AvatarStyleContext = createContext<TtsAvatarStyle>('default')

function FallbackAvatar({ label, fallback, compact = false }: VoiceAvatarProps): ReactElement {
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
}

const GeneratedVoiceAvatar = lazy<ComponentType<VoiceAvatarProps>>(async () => {
  try {
    return await import('./generated-voice-avatar.js')
  } catch {
    return { default: FallbackAvatar }
  }
})

export const VoiceAvatar = memo(function VoiceAvatar(props: VoiceAvatarProps): ReactElement {
  const style = useContext(AvatarStyleContext)
  if (!props.voice?.id.trim()) return <FallbackAvatar {...props} />
  return <Suspense fallback={<FallbackAvatar {...props} />}><GeneratedVoiceAvatar {...props} avatarStyle={props.avatarStyle ?? style} /></Suspense>
})
