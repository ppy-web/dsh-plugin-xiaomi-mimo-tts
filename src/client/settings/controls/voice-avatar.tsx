import { createContext, lazy, memo, Suspense, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ComponentType, ReactElement } from 'react'
import type { TtsAvatarStyle } from '../../shared.js'
import type { VoiceAvatarProps } from './generated-voice-avatar.js'

export const AvatarStyleContext = createContext<TtsAvatarStyle>('default')

function FallbackAvatar({ label, fallback, compact = false }: VoiceAvatarProps): ReactElement {
  const className = compact ? 'xmimo-tts-voice-avatar xmimo-tts-voice-avatar-compact' : 'xmimo-tts-voice-avatar'
  return <span className={`${className} xmimo-tts-voice-avatar-fallback`} aria-hidden="true">{fallback ?? Array.from(label.trim())[0]}</span>
}

type AvatarModule = { default: ComponentType<VoiceAvatarProps> }

const RETRY_DELAYS = [1000, 3000] as const
const listeners = new Set<() => void>()
let loadedAvatar: ComponentType<VoiceAvatarProps> | null = null
let loadingAvatar: Promise<AvatarModule> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0
let reportedFailure = false

function scheduleRetry(): void {
  if (listeners.size === 0 || retryTimer !== undefined || failures === 0 || failures > RETRY_DELAYS.length) return
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    void loadAvatar().catch(() => {})
  }, RETRY_DELAYS[failures - 1])
}

function loadAvatar(): Promise<AvatarModule> {
  if (loadedAvatar !== null) return Promise.resolve({ default: loadedAvatar })
  if (loadingAvatar !== null) return loadingAvatar
  clearTimeout(retryTimer)
  retryTimer = undefined
  loadingAvatar = Promise.resolve().then(() => import('./generated-voice-avatar.js')).then(module => {
    loadedAvatar = module.default
    failures = 0
    for (const listener of listeners) listener()
    return module
  }, error => {
    failures += 1
    if (!reportedFailure) {
      reportedFailure = true
      console.warn('[dsh-xiaomi-tts] Voice avatar module could not be loaded. It will be retried.', error)
    }
    scheduleRetry()
    throw error
  }).finally(() => {
    loadingAvatar = null
  })
  return loadingAvatar
}

function retryAvatars(): void {
  if (loadedAvatar !== null || loadingAvatar !== null) return
  clearTimeout(retryTimer)
  retryTimer = undefined
  failures = 0
  void loadAvatar().catch(() => {})
}

function subscribeAvatars(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('online', retryAvatars)
    window.addEventListener('focus', retryAvatars)
  }
  scheduleRetry()
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    clearTimeout(retryTimer)
    retryTimer = undefined
    failures = 0
    window.removeEventListener('online', retryAvatars)
    window.removeEventListener('focus', retryAvatars)
  }
}

const avatarSnapshot = () => loadedAvatar

function DeferredVoiceAvatar(props: VoiceAvatarProps): ReactElement {
  const LoadedAvatar = useSyncExternalStore(subscribeAvatars, avatarSnapshot, avatarSnapshot)
  // Keep failed lazy results local to a mount. A successful shared retry also
  // replaces placeholders in other pickers that have already finished loading.
  const Avatar = useMemo(() => lazy(async () => {
    try {
      return await loadAvatar()
    } catch {
      return { default: FallbackAvatar }
    }
  }), [])
  if (LoadedAvatar !== null) return <LoadedAvatar {...props} />
  return <Suspense fallback={<FallbackAvatar {...props} />}><Avatar {...props} /></Suspense>
}

export const VoiceAvatar = memo(function VoiceAvatar(props: VoiceAvatarProps): ReactElement {
  const style = useContext(AvatarStyleContext)
  if (!props.voice?.id.trim()) return <FallbackAvatar {...props} />
  return <DeferredVoiceAvatar {...props} avatarStyle={props.avatarStyle ?? style} />
})
