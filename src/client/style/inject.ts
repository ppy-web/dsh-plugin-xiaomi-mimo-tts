import { useEffect, useLayoutEffect } from 'react'

const mountedStyles = new Map<string, { style: HTMLStyleElement; refs: number; persistent: boolean }>()

const useIsomorphicLayoutEffect = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function'
  ? useLayoutEffect
  : useEffect

/** Inject one named stylesheet tag idempotently with ref-counted cleanup inside browser environments. */
export function ensureClientStyle(id: string, css: string, persistent = false): () => void {
  if (typeof document === 'undefined' || document.head === null) return () => {}
  const tracked = mountedStyles.get(id)
  if (tracked !== undefined && tracked.style.isConnected) {
    if (persistent) tracked.persistent = true
    tracked.refs += 1
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      tracked.refs -= 1
      if (tracked.refs <= 0 && !tracked.persistent) {
        tracked.style.remove()
        mountedStyles.delete(id)
      }
    }
  }
  const existing = document.head.querySelector<HTMLStyleElement>(`style[data-plugin="xiaomi-mimo-tts"][data-xmimo-style="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'xiaomi-mimo-tts'
  style.dataset.xmimoStyle = id
  style.textContent = css
  document.head.appendChild(style)
  const entry = { style, refs: 1, persistent }
  mountedStyles.set(id, entry)
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    entry.refs -= 1
    if (entry.refs <= 0 && !entry.persistent) {
      style.remove()
      if (mountedStyles.get(id) === entry) mountedStyles.delete(id)
    }
  }
}

/** Remove retained panel stylesheets when the plugin itself unloads. */
export function disposePersistentClientStyles(): void {
  for (const [id, entry] of mountedStyles) {
    if (!entry.persistent) continue
    entry.style.remove()
    mountedStyles.delete(id)
  }
}

/** Inject a named stylesheet synchronously before first paint and keep it cached across panel switches. */
export function useClientStyle(id: string, css: string): void {
  useIsomorphicLayoutEffect(() => ensureClientStyle(id, css, true), [id, css])
}
