import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../../types/settings.js'
import { resolvedSettingsSnapshot, settingsSliceEqual } from './scope.js'
import type { VoiceReadingWriteOp } from './voice-reading-options.js'

/** Show queued field values until the Host accepts or refuses their atomic patch. */
export function createVoiceReadingWrites(scope: ConfigForm<TtsSettings>, canWrite: () => boolean) {
  const listeners = new Set<() => void>()
  const queued = new Map<string, VoiceReadingWriteOp>()
  let inFlight: VoiceReadingWriteOp[] | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let failed = false
  let snapshot: { patch: Partial<TtsSettings>; failed: boolean } = { patch: {}, failed }

  const publish = (): void => {
    const patch = Object.fromEntries([...(inFlight ?? []), ...queued.values()].map(op => [op.path[0], op.value]))
    if (failed === snapshot.failed && settingsSliceEqual(patch, snapshot.patch)) return
    snapshot = { patch, failed }
    for (const listener of listeners) listener()
  }

  const flush = async (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined
    if (inFlight || queued.size === 0) return
    // Keep the queue while the Host refuses writes: a save elsewhere or a
    // reconnect makes it writable again, and the pending edits must survive.
    if (!canWrite()) return
    const settings = resolvedSettingsSnapshot(scope.getSnapshot())
    const ops = [...queued.values()].filter(op => !Object.is(settings[op.path[0]], op.value))
    queued.clear()
    if (ops.length === 0) { failed = false; publish(); return }
    inFlight = ops
    try {
      if (await scope.mutate(ops)) failed = false
      else failed = true
    } catch {
      failed = true
    } finally {
      inFlight = undefined
      publish()
      if (timer === undefined) void flush()
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    flush,
    write(ops: VoiceReadingWriteOp[], delay = 0): void {
      if (!canWrite() || ops.length === 0) return
      for (const op of ops) queued.set(op.path[0], op)
      failed = false
      publish()
      if (delay === 0) void flush()
      else {
        clearTimeout(timer)
        timer = setTimeout(() => { void flush() }, delay)
      }
    },
  }
}
