export const MINIMAL_MODE_STORAGE_KEY = 'dsh-xiaomi-mimo-tts:minimal-mode'

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readMinimalMode(): boolean {
  try {
    return getStorage()?.getItem(MINIMAL_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeMinimalMode(enabled: boolean): void {
  try {
    getStorage()?.setItem(MINIMAL_MODE_STORAGE_KEY, String(enabled))
  } catch {
    // Storage may be disabled by the browser; the in-memory toggle still works.
  }
}
