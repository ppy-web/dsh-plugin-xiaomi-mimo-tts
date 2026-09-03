import type { Context } from '@deepseek-ai/cordis'

/** Stable structural subset shared by the supported DSH settings implementations. */
export interface SettingsScopeSnapshotCompat<T> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: T | undefined
  readonly base: unknown
  readonly user: unknown
  readonly revision: number | undefined
  readonly writable: boolean
  readonly mode: 'host' | 'memory'
}

/** Avoid tying the published client declarations to the removed client-runtime package. */
export interface SettingsScopeCompat<T> {
  getSnapshot(): SettingsScopeSnapshotCompat<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

interface ClientSlotRegistryCompat {
  inject(name: string, register: () => void): void
  register(
    options: Readonly<Record<string, unknown>>,
    component: unknown,
  ): (() => void) | Iterable<() => void>
}

/** The slots service moved out of client-runtime in 0.1.2; its used surface stayed stable. */
export type ClientContextCompat = Context & {
  readonly slots: ClientSlotRegistryCompat
}
