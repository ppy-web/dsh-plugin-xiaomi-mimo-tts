import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { TTS_VERSION, resolveTtsSettings } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import type { SnapshotSource } from '../plugin-activity.js'
import { hostRoute } from '../host-route.js'

export interface FeatureGuideHistory {
  getVersion: () => string | null
  setVersion: (version: string) => void
}

const rememberedVersions = new Map<string, string>()

function browserFeatureGuideHistory(): FeatureGuideHistory {
  const key = `dsh-xiaomi-mimo-tts:feature-guide-version:${hostRoute('./')}`
  return {
    getVersion: () => {
      const remembered = rememberedVersions.get(key)
      if (remembered !== undefined) return remembered
      try { return window.localStorage.getItem(key) }
      catch { return null }
    },
    setVersion: version => {
      try { window.localStorage.setItem(key, version); rememberedVersions.delete(key) }
      catch { rememberedVersions.set(key, version) }
    },
  }
}

/** One guide shared by startup/version changes and the Host's explicit activation event. */
export class FeatureGuideController implements SnapshotSource<boolean> {
  private open = false
  private active = false
  private checked = false
  private offered = false
  private requested = false
  private disposed = false
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly scope: ConfigForm<TtsSettings>,
    private readonly changes: SnapshotSource<boolean>,
    private readonly version = TTS_VERSION,
    private readonly history = browserFeatureGuideHistory(),
  ) {}

  getSnapshot = (): boolean => this.open
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start = (): (() => void) => {
    const offSettings = this.scope.subscribe(this.update)
    const offChanges = this.changes.subscribe(this.update)
    this.update()
    return () => {
      this.disposed = true
      offChanges()
      offSettings()
      this.publish(false)
    }
  }

  requestActivation = (): void => {
    if (this.disposed || this.offered) return
    this.requested = true
    this.update()
  }

  dismiss = (): void => {
    if (!this.active) return
    this.active = false
    this.history.setVersion(this.version)
    this.publish(false)
  }

  private update = (): void => {
    if (this.disposed) return
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || this.changes.getSnapshot()) {
      this.publish(false)
      return
    }
    if (!resolveTtsSettings(snapshot.value).showFeatureGuide) {
      this.checked = true
      this.requested = false
      this.dismiss()
      return
    }
    if (!this.checked) {
      this.checked = true
      this.requested ||= this.history.getVersion() !== this.version
    }
    if (this.requested && !this.offered) {
      this.requested = false
      this.offered = true
      this.active = true
    }
    this.publish(this.active)
  }

  private publish(open: boolean): void {
    if (this.open === open) return
    this.open = open
    for (const listener of this.listeners) listener()
  }
}
