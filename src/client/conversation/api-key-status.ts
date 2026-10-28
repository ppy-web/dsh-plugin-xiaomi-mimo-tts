import { useEffect, useState } from 'react'
import { TTS_API_KEY_STATUS_ROUTE } from '../../shared.js'
import type { TtsProvider } from '../../types/providers.js'
import { hostRoute } from '../host-route.js'

const cache = new Map<TtsProvider, { expires: number; request: Promise<boolean>; abort: AbortController }>()
const listeners = new Set<() => void>()

export function onTtsCredentialsSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function invalidateApiKeyStatus(): void {
  for (const entry of cache.values()) entry.abort.abort()
  cache.clear()
  for (const listener of listeners) listener()
}

export function useApiKeySupported(active: boolean, provider: TtsProvider = 'xiaomi', revision?: unknown): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [generation, setGeneration] = useState(0)
  useEffect(() => onTtsCredentialsSaved(() => setGeneration(value => value + 1)), [])
  useEffect(() => {
    setSupported(null)
    if (!active) return
    let entry = cache.get(provider)
    if (!entry || entry.expires <= Date.now()) {
      const abort = new AbortController()
      entry = { abort, expires: Date.now() + 2000, request: fetch(`${hostRoute(TTS_API_KEY_STATUS_ROUTE)}?provider=${provider}`, { headers: { accept: 'application/json' }, signal: abort.signal })
        .then(async response => {
          if (!response.ok) throw new Error('api-key-status-failed')
          const result = await response.json() as { supported?: unknown }
          return result.supported === true
        }).catch(() => false) }
      cache.set(provider, entry)
    }
    let mounted = true
    void entry.request.then(value => { if (mounted) setSupported(value) })
    return () => { mounted = false }
  }, [active, provider, revision, generation])
  return supported
}
