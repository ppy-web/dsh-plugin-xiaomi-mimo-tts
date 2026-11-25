import { useCallback, useSyncExternalStore } from 'react'
import { TTS_PROVIDERS } from '../../types/providers.js'
import type { TtsProvider } from '../../types/providers.js'
import type { StudioRoleProvider } from '../../types/studio.js'
import type { ApiKeyStatus } from '../settings/api-key-state.js'
import { apiKeyStatusStore } from '../settings/api-key-status-store.js'
import { externalEngine } from '../engine-state.js'
import { useEngineState } from '../use-engine-state.js'

export type StudioProviderKeyMap = Record<TtsProvider, ApiKeyStatus>

export interface StudioProviderAvailability {
  available: boolean
  reasonKey: 'studio.roles.apiKeyMissing' | 'studio.roles.apiKeyUnrecognized' | 'studio.roles.keyStatusLoading'
    | 'studio.roles.keyStatusUnavailable' | 'studio.roles.mossDisabled' | 'studio.roles.externalUnavailable' | null
}

function useSingleKeyStatus(active: boolean, provider: TtsProvider): ApiKeyStatus {
  const subscribe = useCallback(
    (listener: () => void) => (active ? apiKeyStatusStore.subscribe(provider, listener) : () => {}),
    [active, provider],
  )
  const getSnapshot = useCallback(
    () => (active ? apiKeyStatusStore.getSnapshot(provider) : 'loading'),
    [active, provider],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Observe API key recognition status for all four built-in cloud TTS providers simultaneously. */
export function useStudioProviderKeyStatuses(active = true): StudioProviderKeyMap {
  useEngineState()
  const xiaomi = useSingleKeyStatus(active, 'xiaomi')
  const doubao = useSingleKeyStatus(active, 'doubao')
  const breeze = useSingleKeyStatus(active, 'breeze')
  const deepseek = useSingleKeyStatus(active, 'deepseek')
  return { xiaomi, doubao, breeze, deepseek }
}

/** Determine whether a Studio role's voice engine is ready to use, or disabled due to missing API key / engine. */
export function resolveStudioProviderAvailability(
  provider: StudioRoleProvider,
  keyStatuses: StudioProviderKeyMap,
  mossEnabled: boolean,
): StudioProviderAvailability {
  if (provider === 'moss') {
    return mossEnabled
      ? { available: true, reasonKey: null }
      : { available: false, reasonKey: 'studio.roles.mossDisabled' }
  }
  if (provider.startsWith('external:')) {
    const ext = externalEngine()
    return ext && ext.provider === provider && ext.ready
      ? { available: true, reasonKey: null }
      : { available: false, reasonKey: 'studio.roles.externalUnavailable' }
  }
  if (TTS_PROVIDERS.includes(provider as TtsProvider)) {
    const status = keyStatuses[provider as TtsProvider]
    if (status === 'missing') return { available: false, reasonKey: 'studio.roles.apiKeyMissing' }
    if (status === 'unrecognized') return { available: false, reasonKey: 'studio.roles.apiKeyUnrecognized' }
    if (status === 'loading') return { available: false, reasonKey: 'studio.roles.keyStatusLoading' }
    if (status === 'unavailable') return { available: false, reasonKey: 'studio.roles.keyStatusUnavailable' }
    return { available: true, reasonKey: null }
  }
  return { available: false, reasonKey: 'studio.roles.apiKeyMissing' }
}
