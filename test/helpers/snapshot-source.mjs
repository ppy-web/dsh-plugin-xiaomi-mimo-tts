/** Mutable snapshot source for lifecycle and subscription tests. */
export function snapshotSource(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) { value = next; for (const listener of listeners) listener() },
    get count() { return listeners.size },
  }
}
