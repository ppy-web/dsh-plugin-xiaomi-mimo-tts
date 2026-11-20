export const MINIMAL_MODE_STORAGE_KEY = 'dsh-xiaomi-mimo-tts:minimal-mode'
const listeners = new Set<() => void>()
let fallbackMode = false
let useFallback = false
let cachedMode: boolean | undefined

function publish(mode: boolean): void {
  if (cachedMode === mode) return
  cachedMode = mode
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
  if (event.key === MINIMAL_MODE_STORAGE_KEY || event.key === null) publish(readStoredMode())
}

export function subscribeMinimalMode(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    cachedMode = readStoredMode()
    window.addEventListener('storage', onStorage)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      cachedMode = undefined
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    }
  }
}

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readStoredMode(): boolean {
  try {
    if (useFallback) return fallbackMode
    const storage = getStorage()
    return storage ? storage.getItem(MINIMAL_MODE_STORAGE_KEY) === 'true' : fallbackMode
  } catch {
    return fallbackMode
  }
}

export function readMinimalMode(): boolean { return cachedMode ?? readStoredMode() }

export function writeMinimalMode(enabled: boolean): void {
  fallbackMode = enabled
  try {
    const storage = getStorage()
    storage?.setItem(MINIMAL_MODE_STORAGE_KEY, String(enabled))
    useFallback = !storage
  } catch {
    useFallback = true
    // Storage may be disabled by the browser; the in-memory toggle still works.
  }
  if (listeners.size > 0) publish(enabled)
}
