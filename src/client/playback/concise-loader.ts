type ConciseModule = typeof import('../../text/concise.js')

let pending: Promise<ConciseModule | null> | null = null
let cached: ConciseModule | null = null

export function getLoadedConciseText(): ConciseModule | null {
  return cached
}

export function loadConciseText(): Promise<ConciseModule | null> {
  if (cached !== null) return Promise.resolve(cached)
  if (pending === null) {
    pending = import('../../text/concise.js')
      .then((module) => {
        cached = module
        return module
      })
      .catch(() => {
        pending = null
        return null
      })
  }
  return pending
}

export function preloadConciseText(): void {
  void loadConciseText()
}
