const STORAGE_KEYS = {
  standard: 'dsh-xiaomi-mimo-tts:standard-voice-history',
  cloned: 'dsh-xiaomi-mimo-tts:cloned-voice-history',
} as const
const HISTORY_LIMIT = 10
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
    return normalizeHistory(JSON.parse(storage?.getItem(STORAGE_KEYS[kind]) ?? '[]'))
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
    storage?.setItem(STORAGE_KEYS[kind], JSON.stringify(normalizeHistory(history)))
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
    return normalizeNames(JSON.parse(storage?.getItem(`${STORAGE_KEYS[kind]}:names`) ?? '{}'))
  } catch {
    return {}
  }
}

export function writeVoiceIdNames(kind: VoiceIdHistoryKind, names: Record<string, string>, storage = browserStorage()): void {
  try {
    storage?.setItem(`${STORAGE_KEYS[kind]}:names`, JSON.stringify(normalizeNames(names)))
  } catch {
    // Keep the in-memory names usable when browser storage is unavailable.
  }
}
