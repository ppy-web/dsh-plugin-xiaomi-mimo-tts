import {
  DEFAULT_TTS_SETTINGS,
  isSupportedTtsApiKey,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
  TTS_UNINSTALL_ROUTE,
  TTS_UPDATE_ROUTE,
} from '../src/shared.js'
import type { TtsSettings } from '../src/shared.js'
import type {
  SettingsScopeCompat,
  SettingsScopeSnapshotCompat,
} from '../src/client/dsh-compat.js'

const PREVIEW_API_KEY = 'sk-preview-only'

export class PreviewSettingsScope implements SettingsScopeCompat<TtsSettings> {
  private readonly listeners = new Set<() => void>()
  private readonly base: TtsSettings = { ...DEFAULT_TTS_SETTINGS, apiKey: '' }
  private user: TtsSettings = { apiKey: PREVIEW_API_KEY }
  private writable = true
  private revision = 1
  private snapshot = this.createSnapshot()

  getSnapshot(): SettingsScopeSnapshotCompat<TtsSettings> {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async set(field: string, value: unknown): Promise<void> {
    if (!this.writable) throw new Error('Preview settings are read-only')
    this.user = { ...this.user, [field]: value }
    this.publish()
  }

  async unset(field: string): Promise<void> {
    if (!this.writable) throw new Error('Preview settings are read-only')
    const next = { ...this.user } as Record<string, unknown>
    delete next[field]
    this.user = next as TtsSettings
    this.publish()
  }

  setWritable(writable: boolean): void {
    if (this.writable === writable) return
    this.writable = writable
    this.publish()
  }

  reset(): void {
    this.user = { apiKey: PREVIEW_API_KEY }
    this.writable = true
    this.publish()
  }

  apiKeyStatus(): { configured: boolean; supported: boolean } {
    const apiKey = this.snapshot.value?.apiKey?.trim() ?? ''
    return {
      configured: apiKey.length > 0,
      supported: isSupportedTtsApiKey(apiKey),
    }
  }

  private createSnapshot(): SettingsScopeSnapshotCompat<TtsSettings> {
    return {
      status: 'ready',
      value: { ...this.base, ...this.user },
      base: this.base,
      user: this.user,
      revision: this.revision,
      writable: this.writable,
      mode: 'memory',
    }
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.createSnapshot()
    for (const listener of this.listeners) listener()
  }
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Keep the preview shell local: host mutations and MiMo requests are simulated. */
export function installPreviewFetch(scope: PreviewSettingsScope): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const pathname = new URL(rawUrl, window.location.href).pathname

    if (pathname === TTS_API_KEY_STATUS_ROUTE) return jsonResponse(scope.apiKeyStatus())
    if (pathname === TTS_UPDATE_ROUTE) return jsonResponse({ latestVersion: null, updateAvailable: false })
    if (pathname === TTS_UNINSTALL_ROUTE) return jsonResponse({ ok: true, preview: true })
    if (pathname === TTS_ROUTE || pathname === TTS_STREAM_ROUTE) {
      return jsonResponse({ error: 'The preview shell does not call the MiMo API.' }, 503)
    }
    return originalFetch(input, init)
  }
  return () => { globalThis.fetch = originalFetch }
}
