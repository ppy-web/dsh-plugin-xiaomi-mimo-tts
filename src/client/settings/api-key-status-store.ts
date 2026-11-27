import { useCallback, useSyncExternalStore } from 'react'
import { TTS_API_KEY_STATUS_ROUTE } from '../shared.js'
import { TTS_PROVIDERS, type TtsProvider } from '../../types/providers.js'
import { hostRoute } from '../host-route.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { ApiKeyStatus } from './api-key-state.js'

interface Entry {
  status: ApiKeyStatus
  listeners: Set<() => void>
  request: AbortController | null
}

type StatusKey = TtsProvider | 'open-api'
type HostKeyStatus = 'missing' | 'recognized' | 'unrecognized'
const isHostKeyStatus = (value: unknown): value is HostKeyStatus => value === 'missing' || value === 'recognized' || value === 'unrecognized'

/** One request per provider, shared by every mounted speech surface. Never stores a secret. */
export class ApiKeyStatusStore {
  private available = true
  private hostStatuses: (Record<TtsProvider, HostKeyStatus> & { openApi?: HostKeyStatus }) | null = null
  private readonly entries = new Map<StatusKey, Entry>()

  private entry(key: StatusKey): Entry {
    let entry = this.entries.get(key)
    if (entry === undefined) {
      entry = { status: 'loading', listeners: new Set(), request: null }
      this.entries.set(key, entry)
    }
    return entry
  }

  getSnapshot = (provider: TtsProvider): ApiKeyStatus => this.entry(provider).status

  getOpenApiSnapshot = (): ApiKeyStatus => this.entry('open-api').status

  subscribe(provider: TtsProvider, listener: () => void): () => void {
    return this.subscribeKey(provider, listener)
  }

  subscribeOpenApi(listener: () => void): () => void {
    return this.subscribeKey('open-api', listener)
  }

  private subscribeKey(key: StatusKey, listener: () => void): () => void {
    const entry = this.entry(key)
    entry.listeners.add(listener)
    this.load(key, entry)
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0) this.reset(entry)
    }
  }

  setAvailable(available: boolean): void {
    if (this.available === available) return
    this.available = available
    this.invalidate()
  }

  hasHostStatuses(): boolean { return this.hostStatuses !== null }

  acceptHostStatuses = (value: unknown): void => {
    if (value === null) {
      if (!this.hostStatuses) return
      this.hostStatuses = null
      this.invalidate()
      return
    }
    if (!value || typeof value !== 'object') return
    const statuses = value as Record<string, unknown>
    if (!TTS_PROVIDERS.every(provider => isHostKeyStatus(statuses[provider]))) return
    this.hostStatuses = statuses as Record<TtsProvider, HostKeyStatus> & { openApi?: HostKeyStatus }
    if (!this.available) return
    for (const [key, entry] of this.entries) {
      const status = key === 'open-api' ? this.hostStatuses.openApi : this.hostStatuses[key]
      if (!isHostKeyStatus(status) || entry.status === status) continue
      this.reset(entry)
      entry.status = status
      for (const listener of entry.listeners) listener()
    }
  }

  invalidate = (): void => {
    for (const [key, entry] of this.entries) {
      this.reset(entry)
      this.load(key, entry)
      for (const listener of entry.listeners) listener()
    }
  }

  private reset(entry: Entry): void {
    const request = entry.request
    entry.request = null
    request?.abort()
    entry.status = 'loading'
  }

  private load(key: StatusKey, entry: Entry): void {
    if (!this.available || entry.listeners.size === 0 || entry.request !== null || entry.status !== 'loading') return
    const hostStatus = this.hostStatuses ? (key === 'open-api' ? this.hostStatuses.openApi : this.hostStatuses[key]) : undefined
    if (isHostKeyStatus(hostStatus)) {
      entry.status = hostStatus
      return
    }
    const request = new AbortController()
    entry.request = request
    const publish = (status: ApiKeyStatus): void => {
      // A cancelled fetch may still resolve, including after a new request has started.
      if (entry.request !== request) return
      entry.request = null
      entry.status = status
      for (const listener of entry.listeners) listener()
    }
    void (async () => {
      try {
        const response = await fetch(`${hostRoute(TTS_API_KEY_STATUS_ROUTE)}?provider=${key}`, {
          cache: 'no-store', headers: { accept: 'application/json' }, signal: request.signal,
        })
        if (!response.ok) throw new Error('api-key-status-failed')
        const body: unknown = await response.json()
        if (body === null || typeof body !== 'object'
          || !('configured' in body) || typeof body.configured !== 'boolean'
          || !('supported' in body) || typeof body.supported !== 'boolean') throw new Error('api-key-status-invalid')
        publish(!body.configured ? 'missing' : body.supported ? 'recognized' : 'unrecognized')
      } catch {
        publish('unavailable')
      }
    })()
  }
}

export const apiKeyStatusStore = new ApiKeyStatusStore()

export function useOpenApiTokenStatus(active: boolean): ApiKeyStatus {
  const subscribe = useCallback((listener: () => void) => active
    ? apiKeyStatusStore.subscribeOpenApi(listener)
    : () => {}, [active])
  const getSnapshot = useCallback(() => active ? apiKeyStatusStore.getOpenApiSnapshot() : 'loading', [active])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Scope readiness includes host reconnections; bundle activity pauses all subscribers together. */
export function bindApiKeyStatus(
  scope: SnapshotSource<{ status: string; revision: unknown }>,
  changes: SnapshotSource<boolean>,
  store = apiKeyStatusStore,
): () => void {
  let revision = scope.getSnapshot().revision
  const update = (): void => {
    const snapshot = scope.getSnapshot()
    const available = snapshot.status === 'ready' && !changes.getSnapshot()
    // Invalidate before resuming so reconnect and revision changes share one request.
    if (!Object.is(revision, snapshot.revision)) {
      revision = snapshot.revision
      if (!store.hasHostStatuses()) store.setAvailable(false)
    }
    store.setAvailable(available)
  }
  const offScope = scope.subscribe(update)
  const offChanges = changes.subscribe(update)
  update()
  return () => { offScope(); offChanges(); store.setAvailable(false) }
}
