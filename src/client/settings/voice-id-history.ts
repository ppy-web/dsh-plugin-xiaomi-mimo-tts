const STORAGE_KEYS = {
  standard: 'dsh-xiaomi-mimo-tts:standard-voice-history',
  cloned: 'dsh-xiaomi-mimo-tts:cloned-voice-history',
  breeze: 'dsh-xiaomi-mimo-tts:breeze-voice-history',
} as const
const HISTORY_LIMIT = 10
let revision = 0
const listeners = new Set<() => void>()
const memory = new Map<string, string>()
const storageMemory = new WeakMap<HistoryStorage, Map<string, string>>()
function memoryFor(storage: HistoryStorage | undefined): Map<string, string> {
  if (!storage) return memory
  let values = storageMemory.get(storage)
  if (!values) { values = new Map(); storageMemory.set(storage, values) }
  return values
}
const changed = (): void => { revision += 1; for (const listener of listeners) listener() }
const storageChanged = (event: StorageEvent): void => {
  if (event.key === null || Object.values(STORAGE_KEYS).some(key => event.key?.startsWith(key))) changed()
}
export const voiceIdRevision = (): number => revision
export function subscribeVoiceIds(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', storageChanged)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', storageChanged)
  }
}
function readStored(key: string, storage: HistoryStorage | undefined): string | null {
  try { return storage ? storage.getItem(key) : memoryFor(storage).get(key) ?? null } catch { return memoryFor(storage).get(key) ?? null }
}
function writeStored(key: string, value: string, storage: HistoryStorage | undefined): void {
  if (readStored(key, storage) === value) return
  memoryFor(storage).set(key, value)
  try { storage?.setItem(key, value) } catch { /* Session memory remains available. */ }
  changed()
}
export type VoiceIdHistoryKind = keyof typeof STORAGE_KEYS
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): HistoryStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function normalizeHistory(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean))].slice(0, HISTORY_LIMIT)
}

export function readVoiceIdHistory(kind: VoiceIdHistoryKind, storage = browserStorage()): string[] {
  try {
    return normalizeHistory(JSON.parse(readStored(STORAGE_KEYS[kind], storage) ?? '[]'))
  } catch {
    return []
  }
}

export function rememberVoiceId(history: string[], value: string): string[] {
  return normalizeHistory([value, ...history])
}

export function forgetVoiceId(history: string[], names: Record<string, string>, value: string): { history: string[]; names: Record<string, string> } {
  const id = value.trim()
  return {
    history: history.filter(voice => voice !== id),
    names: Object.fromEntries(Object.entries(names).filter(([voice]) => voice !== id)),
  }
}

export function writeVoiceIdHistory(kind: VoiceIdHistoryKind, history: string[], storage = browserStorage()): void {
  try {
    writeStored(STORAGE_KEYS[kind], JSON.stringify(normalizeHistory(history)), storage)
  } catch {
    // Keep the in-memory history usable when browser storage is unavailable.
  }
}

function normalizeNames(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .filter(([id, name]) => id.trim() && typeof name === 'string' && name.trim())
    .map(([id, name]) => [id.trim(), (name as string).trim()]))
}

export function readVoiceIdNames(kind: VoiceIdHistoryKind, storage = browserStorage()): Record<string, string> {
  try {
    return normalizeNames(JSON.parse(readStored(`${STORAGE_KEYS[kind]}:names`, storage) ?? '{}'))
  } catch {
    return {}
  }
}

export function writeVoiceIdNames(kind: VoiceIdHistoryKind, names: Record<string, string>, storage = browserStorage()): void {
  try {
    writeStored(`${STORAGE_KEYS[kind]}:names`, JSON.stringify(normalizeNames(names)), storage)
  } catch {
    // Keep the in-memory names usable when browser storage is unavailable.
  }
}
