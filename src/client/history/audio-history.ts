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
  blob: Blob
}

export type AudioHistoryInput = Omit<AudioHistoryEntry, 'id' | 'createdAt'>

export interface AudioHistoryStorage {
  load(): Promise<AudioHistoryEntry[]>
  replace(entries: readonly AudioHistoryEntry[]): Promise<void>
  close(): void
}

export interface AudioHistoryView {
  entries: readonly AudioHistoryEntry[]
  status: 'loading' | 'ready' | 'memory'
  skipped: boolean
}

/** One origin-local store, owned by the plugin context; no side effects at import time. */
export class AudioHistory {
  private view: AudioHistoryView = { entries: [], status: 'loading', skipped: false }
  private readonly listeners = new Set<() => void>()
  private readonly replayStops = new Set<() => void>()
  private chain: Promise<void>
  private disposed = false
  private storageLoaded = false
  private readonly storage: AudioHistoryStorage

  constructor(storage: AudioHistoryStorage = new IndexedDbAudioHistoryStorage()) {
    this.storage = storage
    this.chain = storage.load().then((entries) => {
      this.storageLoaded = true
      this.publish({ entries: retainAudioHistory(entries), status: 'ready', skipped: false })
    }).catch(() => this.publish({ entries: [], status: 'memory', skipped: false }))
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
    return this.mutate(() => this.publish({ ...this.view, entries: [], skipped: false }))
  }

  reportSkipped(): Promise<void> {
    return this.mutate(() => this.publish({ ...this.view, skipped: true }))
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.stopReplay()
    this.replayStops.clear()
    this.listeners.clear()
    await this.chain
    this.storage.close()
  }

  private mutate(update: () => void): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.chain = this.chain.then(async () => {
      update()
      if (!this.storageLoaded) return
      try {
        await this.storage.replace(this.view.entries)
        if (this.view.status === 'memory') this.publish({ ...this.view, status: 'ready' })
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
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false
      const request = indexedDB.open('dsh-xiaomi-tts-audio-history', 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('audio', { keyPath: 'id' }) }
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return }
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
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

  async replace(entries: readonly AudioHistoryEntry[]): Promise<void> {
    if (this.database === null) throw new Error('audio-history-unavailable')
    const nextIds = new Set(entries.map((entry) => entry.id))
    await new Promise<void>((resolve, reject) => {
      const transaction = this.database!.transaction('audio', 'readwrite')
      const store = transaction.objectStore('audio')
      for (const id of this.ids) if (!nextIds.has(id)) store.delete(id)
      for (const entry of entries) if (!this.ids.has(entry.id)) store.put(entry)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    this.ids = nextIds
  }

  close(): void { this.database?.close(); this.database = null }
}
