import { TTS_API_KEY_STATUS_ROUTE } from '../../shared.js'
import type { TtsProvider } from '../../types/providers.js'
import { hostRoute } from '../host-route.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { ApiKeyStatus } from './api-key-state.js'

interface Entry {
  status: ApiKeyStatus
  listeners: Set<() => void>
  request: AbortController | null
}

/** One request per provider, shared by every mounted speech surface. Never stores a secret. */
export class ApiKeyStatusStore {
  private available = true
  private readonly entries = new Map<TtsProvider, Entry>()

  private entry(provider: TtsProvider): Entry {
    let entry = this.entries.get(provider)
    if (entry === undefined) {
      entry = { status: 'loading', listeners: new Set(), request: null }
      this.entries.set(provider, entry)
    }
    return entry
  }

  getSnapshot = (provider: TtsProvider): ApiKeyStatus => this.entry(provider).status

  subscribe(provider: TtsProvider, listener: () => void): () => void {
    const entry = this.entry(provider)
    entry.listeners.add(listener)
    this.load(provider, entry)
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

  invalidate = (): void => {
    for (const [provider, entry] of this.entries) {
      this.reset(entry)
      this.load(provider, entry)
      for (const listener of entry.listeners) listener()
    }
  }

  private reset(entry: Entry): void {
    const request = entry.request
    entry.request = null
    request?.abort()
    entry.status = 'loading'
  }

  private load(provider: TtsProvider, entry: Entry): void {
    if (!this.available || entry.listeners.size === 0 || entry.request !== null || entry.status !== 'loading') return
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
        const response = await fetch(`${hostRoute(TTS_API_KEY_STATUS_ROUTE)}?provider=${provider}`, {
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
      store.setAvailable(false)
    }
    store.setAvailable(available)
  }
  const offScope = scope.subscribe(update)
  const offChanges = changes.subscribe(update)
  update()
  return () => { offScope(); offChanges(); store.setAvailable(false) }
}
