export function isSpeechBusy(status: string): boolean {
  return status === 'loading' || status === 'playing' || status === 'paused'
}

/** Queries live controllers; no duplicated playback state or global singleton. */
export class SpeechActivity {
  private readonly queries = new Map<() => boolean, (() => void) | undefined>()

  register(query: () => boolean, stop?: () => void): () => void {
    this.queries.set(query, stop)
    return () => { this.queries.delete(query) }
  }

  isBusy = (): boolean => [...this.queries.keys()].some(query => query())

  interrupt = (): void => {
    for (const [query, stop] of this.queries) if (query()) stop?.()
  }
}
