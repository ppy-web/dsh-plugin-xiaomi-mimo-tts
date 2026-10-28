import { useCallback, useSyncExternalStore } from 'react'
import type { TtsProvider } from '../../types/providers.js'
import type { ApiKeyStatus } from '../settings/api-key-state.js'
import { apiKeyStatusStore } from '../settings/api-key-status-store.js'

const listeners = new Set<() => void>()

export function onTtsCredentialsSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function invalidateApiKeyStatus(): void {
  apiKeyStatusStore.invalidate()
  for (const listener of listeners) listener()
}

export function useApiKeyStatus(active: boolean, provider: TtsProvider): ApiKeyStatus {
  const subscribe = useCallback((listener: () => void) => active
    ? apiKeyStatusStore.subscribe(provider, listener)
    : () => {}, [active, provider])
  const getSnapshot = useCallback(() => active ? apiKeyStatusStore.getSnapshot(provider) : 'loading', [active, provider])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useApiKeySupported(active: boolean, provider: TtsProvider = 'xiaomi'): boolean | null {
  const status = useApiKeyStatus(active, provider)
  return status === 'loading' ? null : status === 'recognized'
}
