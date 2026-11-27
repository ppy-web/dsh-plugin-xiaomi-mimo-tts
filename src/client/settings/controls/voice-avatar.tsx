import { createContext, memo, useContext } from 'react'
import type { ReactElement } from 'react'
import type { TtsAvatarStyle } from '../../shared.js'
import GeneratedVoiceAvatar from './generated-voice-avatar.js'
import type { VoiceAvatarProps } from './generated-voice-avatar.js'

export const AvatarStyleContext = createContext<TtsAvatarStyle>('default')

function FallbackAvatar({ label, fallback, compact = false }: VoiceAvatarProps): ReactElement {
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
}

export const VoiceAvatar = memo(function VoiceAvatar(props: VoiceAvatarProps): ReactElement {
  const style = useContext(AvatarStyleContext)
  if (!props.voice?.id.trim()) return <FallbackAvatar {...props} />
  return <GeneratedVoiceAvatar {...props} avatarStyle={props.avatarStyle ?? style} />
})
