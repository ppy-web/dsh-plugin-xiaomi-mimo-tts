import { useEffect, useLayoutEffect } from 'react'

const mountedStyles = new Map<string, { style: HTMLStyleElement; refs: number }>()

const useIsomorphicLayoutEffect = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function'
  ? useLayoutEffect
  : useEffect

/** Inject one named stylesheet tag idempotently with ref-counted cleanup inside browser environments. */
export function ensureClientStyle(id: string, css: string): () => void {
  if (typeof document === 'undefined' || document.head === null) return () => {}
  const tracked = mountedStyles.get(id)
  if (tracked !== undefined && tracked.style.isConnected) {
    tracked.refs += 1
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      tracked.refs -= 1
      if (tracked.refs <= 0) {
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
  const entry = { style, refs: 1 }
  mountedStyles.set(id, entry)
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    entry.refs -= 1
    if (entry.refs <= 0) {
      style.remove()
      if (mountedStyles.get(id) === entry) mountedStyles.delete(id)
    }
  }
}

/** Inject a named stylesheet synchronously before first paint in browser environments to prevent FOUC. */
export function useClientStyle(id: string, css: string): void {
  useIsomorphicLayoutEffect(() => ensureClientStyle(id, css), [id, css])
}
