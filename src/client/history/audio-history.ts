export const AUDIO_HISTORY_MAX_ENTRIES = 100
export const AUDIO_HISTORY_MAX_BYTES = 100 * 1024 * 1024

export interface AudioHistoryEntry {
  id: string
  createdAt: number
  text: string
  source: 'conversation' | 'preview' | 'service'
  format: 'mp3' | 'wav'
  sessionId?: string
  messageId?: string
  /** The saved audio already includes the requested synthesis speed. */
  voiceRateApplied?: boolean
  blob: Blob
}

export type AudioHistoryInput = Omit<AudioHistoryEntry, 'id' | 'createdAt'>

export interface AudioHistoryStorage {
  load(): Promise<AudioHistoryEntry[]>
  replace(entries: readonly AudioHistoryEntry[], clear?: boolean): Promise<readonly AudioHistoryEntry[] | void>
  close(): void
}

export interface AudioHistoryView {
  entries: readonly AudioHistoryEntry[]
  status: 'loading' | 'ready' | 'memory'
  skipped: boolean
}

const AUDIO_HISTORY_CHANNEL = 'dsh-xiaomi-mimo-tts:audio-history'

/** One origin-local store, owned by the plugin context; no side effects at import time. */
export class AudioHistory {
  private view: AudioHistoryView = { entries: [], status: 'loading', skipped: false }
  private readonly listeners = new Set<() => void>()
  private readonly replayStops = new Set<() => void>()
  private chain: Promise<void> = Promise.resolve()
  private loadPromise: Promise<void> | null = null
  private disposed = false
  private storageLoaded = false
  private readonly storage: AudioHistoryStorage
  private channel: BroadcastChannel | null = null

  constructor(storage?: AudioHistoryStorage) {
    const eager = storage !== undefined
    this.storage = storage ?? new IndexedDbAudioHistoryStorage()
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(AUDIO_HISTORY_CHANNEL)
        this.channel.onmessage = () => {
          if (!this.disposed && this.loadPromise !== null) void this.reloadFromStorage()
        }
      } catch {
        this.channel = null
      }
    }
    if (eager) void this.ensureLoaded()
  }

  ensureLoaded(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.loadPromise === null) {
      const load = this.storage.load().then((entries) => {
        if (this.disposed) return
        this.storageLoaded = true
        this.publish({ entries: retainAudioHistory(entries), status: 'ready', skipped: false })
      }).catch(() => {
        if (!this.disposed) this.publish({ entries: [], status: 'memory', skipped: false })
      })
      this.chain = this.chain.then(() => load)
      this.loadPromise = this.chain
    }
    return this.loadPromise
  }

  private reloadFromStorage(): Promise<void> {
    this.chain = this.chain.then(async () => {
      if (this.disposed || this.view.status !== 'ready') return
      try {
        const entries = await this.storage.load()
        if (!this.disposed) this.publish({ ...this.view, entries: retainAudioHistory(entries), status: 'ready' })
      } catch {
        // Keep current in-memory snapshot if reload fails.
      }
    })
    return this.chain
  }

  getSnapshot = (): AudioHistoryView => this.view
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  onStopReplay(listener: () => void): () => void {
    this.replayStops.add(listener)
    return () => { this.replayStops.delete(listener) }
  }

  stopReplay(): void { for (const stop of this.replayStops) stop() }

  add(input: AudioHistoryInput): Promise<void> {
    return this.mutate(() => {
      if (input.blob.size === 0) return
      if (input.blob.size > AUDIO_HISTORY_MAX_BYTES) {
        this.publish({ ...this.view, skipped: true })
        return
      }
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const entry: AudioHistoryEntry = { ...input, text: input.text.slice(0, 500), id, createdAt: Date.now() }
      this.publish({ ...this.view, entries: retainAudioHistory([entry, ...this.view.entries]) })
    })
  }

  remove(id: string): Promise<void> {
    return this.mutate(() => this.publish({ ...this.view, entries: this.view.entries.filter((entry) => entry.id !== id) }))
  }

  clear(): Promise<void> {
    return this.mutate(() => this.publish({ ...this.view, entries: [], skipped: false }), true)
  }

  reportSkipped(): Promise<void> {
    return this.mutate(() => this.publish({ ...this.view, skipped: true }))
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.channel?.close()
    this.channel = null
    this.stopReplay()
    this.replayStops.clear()
    this.listeners.clear()
    await this.chain
    this.storage.close()
  }

  private mutate(update: () => void, clear = false): Promise<void> {
    if (this.disposed) return Promise.resolve()
    void this.ensureLoaded()
    this.chain = this.chain.then(async () => {
      if (this.disposed) return
      update()
      if (!this.storageLoaded) return
      try {
        const saved = await this.storage.replace(this.view.entries, clear)
        this.channel?.postMessage('changed')
        if (saved !== undefined || this.view.status === 'memory') {
          this.publish({ ...this.view, entries: saved ?? this.view.entries, status: 'ready' })
        }
      }
      catch { this.publish({ ...this.view, status: 'memory' }) }
    })
    return this.chain
  }

  private publish(view: AudioHistoryView): void {
    this.view = view
    for (const listener of this.listeners) listener()
  }
}

export function retainAudioHistory(entries: readonly AudioHistoryEntry[]): AudioHistoryEntry[] {
  let bytes = 0
  const retained: AudioHistoryEntry[] = []
  for (const entry of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    if (entry.blob.size === 0 || entry.blob.size > AUDIO_HISTORY_MAX_BYTES) continue
    if (retained.length >= AUDIO_HISTORY_MAX_ENTRIES || bytes + entry.blob.size > AUDIO_HISTORY_MAX_BYTES) break
    bytes += entry.blob.size
    retained.push(entry)
  }
  return retained
}

class IndexedDbAudioHistoryStorage implements AudioHistoryStorage {
  private database: IDBDatabase | null = null
  private ids = new Set<string>()

  async load(): Promise<AudioHistoryEntry[]> {
    this.database ??= await new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false
      const request = indexedDB.open('dsh-xiaomi-tts-audio-history', 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('audio', { keyPath: 'id' }) }
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return }
        const database = request.result
        database.onversionchange = () => {
          database.close()
          if (this.database === database) this.database = null
        }
        resolve(database)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => { blocked = true; reject(new Error('audio-history-blocked')) }
    })
    return new Promise((resolve, reject) => {
      const transaction = this.database!.transaction('audio', 'readonly')
      const request = transaction.objectStore('audio').getAll()
      transaction.oncomplete = () => {
        const entries = request.result as AudioHistoryEntry[]
        this.ids = new Set(entries.map((entry) => entry.id))
        resolve(entries)
      }
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  async replace(entries: readonly AudioHistoryEntry[], clear = false): Promise<readonly AudioHistoryEntry[]> {
    if (this.database === null) throw new Error('audio-history-unavailable')
    const nextIds = new Set(entries.map((entry) => entry.id))
    const additions = entries.filter(entry => !this.ids.has(entry.id))
    let retained: AudioHistoryEntry[] = []
    await new Promise<void>((resolve, reject) => {
      const transaction = this.database!.transaction('audio', 'readwrite')
      const store = transaction.objectStore('audio')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
      if (clear) { store.clear(); return }
      const current = store.getAll()
      current.onsuccess = () => {
        const stored = current.result as AudioHistoryEntry[]
        const storedIds = new Set(stored.map(entry => entry.id))
        retained = retainAudioHistory([
          ...additions.filter(entry => !storedIds.has(entry.id)),
          ...stored.filter(entry => !this.ids.has(entry.id) || nextIds.has(entry.id)),
        ])
        const retainedIds = new Set(retained.map(entry => entry.id))
        for (const { id } of stored) if (!retainedIds.has(id)) store.delete(id)
        for (const entry of retained) if (!storedIds.has(entry.id)) store.put(entry)
      }
    })
    this.ids = new Set(retained.map(entry => entry.id))
    return retained
  }

  close(): void { this.database?.close(); this.database = null }
}
