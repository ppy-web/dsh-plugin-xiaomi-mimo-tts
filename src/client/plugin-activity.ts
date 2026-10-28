import type { AudioFocus } from './playback/tab-audio-focus.js'

export interface SnapshotSource<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}

export const IDLE_PLUGIN_CHANGES: SnapshotSource<boolean> = {
  getSnapshot: () => false,
  subscribe: () => () => {},
}

/** Management activity gates every playback owner through the same audio permission. */
export class PluginAudioFocus implements AudioFocus {
  constructor(private readonly focus: AudioFocus, private readonly changes: SnapshotSource<boolean>) {}

  canPlay = (): boolean => !this.changes.getSnapshot() && this.focus.canPlay()
  claim = (): void => { if (!this.changes.getSnapshot()) this.focus.claim() }
  subscribe = (listener: () => void): (() => void) => {
    let previous = this.canPlay()
    const update = (): void => {
      const current = this.canPlay()
      if (current === previous) return
      previous = current
      listener()
    }
    const offFocus = this.focus.subscribe(update)
    const offChanges = this.changes.subscribe(update)
    return () => { offChanges(); offFocus() }
  }
}

/** React only to this bundle entering or leaving a management operation. */
export function observePluginActivity(changes: SnapshotSource<boolean>, onStart: () => void, onSettled: () => void = () => {}): () => void {
  let previous = false
  const update = (): void => {
    const current = changes.getSnapshot()
    if (current === previous) return
    previous = current
    if (current) onStart()
    else onSettled()
  }
  const off = changes.subscribe(update)
  update()
  return off
}
