import { useCallback, useSyncExternalStore } from 'react'
import type { TtsProvider } from '../../types/providers.js'
import type { ApiKeyStatus } from '../settings/api-key-state.js'
import { apiKeyStatusStore } from '../settings/api-key-status-store.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'

export function invalidateApiKeyStatus(): void {
  if (!apiKeyStatusStore.hasHostStatuses()) apiKeyStatusStore.invalidate()
}

export function useApiKeyStatus(active: boolean, provider: TtsProvider): ApiKeyStatus {
  const engine = useEngineState()
  const external = externalEngine()
  active = active && !external
  const subscribe = useCallback((listener: () => void) => active
    ? apiKeyStatusStore.subscribe(provider, listener)
    : () => {}, [active, provider])
  const getSnapshot = useCallback(() => active ? apiKeyStatusStore.getSnapshot(provider) : 'loading', [active, provider])
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return external ? engine.status !== 'ready' ? 'unavailable' : external.ready ? 'recognized' : 'missing' : status
}

export function useApiKeySupported(active: boolean, provider: TtsProvider = 'xiaomi'): boolean | null {
  const status = useApiKeyStatus(active, provider)
  return status === 'loading' || status === 'unavailable' ? null : status === 'recognized'
}
