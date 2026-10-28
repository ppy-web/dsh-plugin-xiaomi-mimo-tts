import type { SnapshotSource } from '../plugin-activity.js'

export type FoldedReplies = 'all' | 'final'

/** Keep the host's reply selection independent from the plugin's per-reply length limit. */
export class AutomaticReading implements SnapshotSource<FoldedReplies> {
  private mode: FoldedReplies = 'all'
  private readonly listeners = new Set<() => void>()
  private readonly running = new Map<string, boolean>()
  private readonly blocked = new Set<string>()
  private automatic = false

  getSnapshot = (): FoldedReplies => this.mode
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  update(value: unknown, stop: () => void, reset: () => void): void {
    const next = value === 'final' ? 'final' : 'all'
    if (next === this.mode) return
    this.mode = next
    for (const [id, running] of this.running) if (running) this.blocked.add(id)
    if (this.automatic) stop()
    this.automatic = false
    reset()
    for (const listener of this.listeners) listener()
  }

  observe(sessionId: string, running: boolean): void {
    if (running && this.running.get(sessionId) !== true) this.blocked.delete(sessionId)
    this.running.set(sessionId, running)
  }

  allowed(sessionId: string): boolean { return !this.blocked.has(sessionId) }
  markAutomatic(): void { this.automatic = true }
  markManual(): void { this.automatic = false }
  release(sessionId: string): void { this.running.delete(sessionId); this.blocked.delete(sessionId) }
}
