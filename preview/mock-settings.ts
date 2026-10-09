import {
  DEFAULT_TTS_SETTINGS,
  isSupportedTtsApiKey,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
  TTS_UPDATE_ROUTE,
} from '../src/shared.js'
import type { TtsSettings } from '../src/shared.js'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PcmRecording } from '../src/client/history/pcm-recording.js'

export class PreviewSettingsScope implements ConfigForm<TtsSettings> {
  private readonly listeners = new Set<() => void>()
  private readonly base: TtsSettings = { ...DEFAULT_TTS_SETTINGS, apiKey: '' }
  private user: TtsSettings = {}
  private writable = true
  private revision = 1
  private snapshot = this.createSnapshot()

  getSnapshot(): ConfigFormSnapshot<TtsSettings> {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async set(field: string, value: unknown): Promise<boolean> {
    if (!this.writable) throw new Error('Preview settings are read-only')
    this.user = { ...this.user, [field]: value }
    this.publish()
    return true
  }

  async mutate(ops: Parameters<ConfigForm<TtsSettings>['mutate']>[0]): Promise<boolean> {
    if (!this.writable) throw new Error('Preview settings are read-only')
    const next = { ...this.user } as Record<string, unknown>
    for (const op of ops) {
      const field = op.path[0]
      if (field === undefined || op.path.length !== 1) continue
      if (op.op === 'set') next[field] = op.value
      else delete next[field]
    }
    this.user = next as TtsSettings
    this.publish()
    return true
  }

  async unset(field: string): Promise<boolean> {
    if (!this.writable) throw new Error('Preview settings are read-only')
    const next = { ...this.user } as Record<string, unknown>
    delete next[field]
    this.user = next as TtsSettings
    this.publish()
    return true
  }

  setWritable(writable: boolean): void {
    if (this.writable === writable) return
    this.writable = writable
    this.publish()
  }

  reset(): void {
    this.user = {}
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

  private createSnapshot(): ConfigFormSnapshot<TtsSettings> {
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

/** A short local tone exercises the real playback/history UI without API credentials. */
function previewAudioResponse(stream: boolean): Response {
  const samples = new ArrayBuffer(24000)
  const view = new DataView(samples)
  for (let index = 0; index < 12000; index += 1) {
    const envelope = Math.sin(Math.PI * index / 12000)
    view.setInt16(index * 2, Math.round(Math.sin(2 * Math.PI * 440 * index / 24000) * envelope * 4000), true)
  }
  const pcm = btoa(Array.from(new Uint8Array(samples), (byte) => String.fromCharCode(byte)).join(''))
  if (stream) {
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const recording = new PcmRecording()
  recording.append(pcm)
  return new Response(recording.toWav(), { headers: { 'content-type': 'audio/wav' } })
}

/** Keep the preview shell local: host mutations and MiMo requests are simulated. */
export function installPreviewFetch(scope: PreviewSettingsScope): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const pathname = new URL(rawUrl, window.location.href).pathname

    if (pathname === TTS_API_KEY_STATUS_ROUTE) return jsonResponse(scope.apiKeyStatus())
    if (pathname === TTS_UPDATE_ROUTE) return jsonResponse({ latestVersion: null, updateAvailable: false })
    if (pathname === TTS_ROUTE || pathname === TTS_STREAM_ROUTE) {
      return previewAudioResponse(pathname === TTS_STREAM_ROUTE)
    }
    return originalFetch(input, init)
  }
  return () => { globalThis.fetch = originalFetch }
}
