import {
  DEFAULT_TTS_SETTINGS,
  isSupportedTtsApiKey,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
} from '../../src/shared.js'
import type { TtsSettings } from '../../src/shared.js'
import type { TtsProvider } from '../../src/types/providers.js'
import { TTS_DUPLEX_ROUTE } from '../../src/constants.js'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PcmRecording } from '../../src/client/history/pcm-recording.js'
import type { ApiKeyStatus } from '../../src/client/settings/api-key-state.js'

export class PreviewSettingsScope implements ConfigForm<TtsSettings> {
  private readonly listeners = new Set<() => void>()
  private readonly base: TtsSettings = { ...DEFAULT_TTS_SETTINGS, apiKey: '' }
  private user: TtsSettings = {}
  private writable = true
  private revision = 1
  keyStatusPreview: ApiKeyStatus | null = null
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
    this.keyStatusPreview = null
    this.user = {}
    this.writable = true
    this.publish()
  }

  apiKeyStatus(provider: TtsProvider = this.snapshot.value?.provider ?? 'xiaomi'): { configured: boolean; supported: boolean; provider: TtsProvider } {
    if (this.keyStatusPreview !== null) return {
      configured: this.keyStatusPreview !== 'missing',
      supported: this.keyStatusPreview === 'recognized',
      provider,
    }
    const apiKey = this.snapshot.value?.[provider === 'doubao' ? 'doubaoApiKey' : 'apiKey']?.trim() ?? ''
    return {
      provider,
      configured: apiKey.length > 0,
      supported: isSupportedTtsApiKey(apiKey, provider),
    }
  }

  setKeyStatusPreview(status: ApiKeyStatus | null): void {
    this.keyStatusPreview = status
    this.publish()
  }

  private createSnapshot(): ConfigFormSnapshot<TtsSettings> {
    return {
      status: 'ready',
      value: { ...this.base, ...this.user },
      base: this.base,
      user: this.user,
      revision: this.revision,
      writable: this.writable,
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
function previewPcm(): ArrayBuffer {
  const samples = new ArrayBuffer(24000)
  const view = new DataView(samples)
  for (let index = 0; index < 12000; index += 1) {
    const envelope = Math.sin(Math.PI * index / 12000)
    view.setInt16(index * 2, Math.round(Math.sin(2 * Math.PI * 440 * index / 24000) * envelope * 4000), true)
  }
  return samples
}

function previewAudioResponse(stream: boolean): Response {
  const samples = previewPcm()
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
  const restoreSockets = installPreviewSockets()
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, window.location.href)
    const pathname = url.pathname

    if (pathname === TTS_API_KEY_STATUS_ROUTE) {
      if (scope.keyStatusPreview === 'unavailable') return jsonResponse({}, 503)
      if (scope.keyStatusPreview === 'loading') return new Promise((_resolve, reject) => {
        const abort = (): void => reject(new DOMException('Aborted', 'AbortError'))
        if (init?.signal?.aborted) abort()
        else init?.signal?.addEventListener('abort', abort, { once: true })
      })
      return jsonResponse(scope.apiKeyStatus(url.searchParams.get('provider') === 'doubao' ? 'doubao' : 'xiaomi'))
    }
    if (pathname === TTS_ROUTE || pathname === TTS_STREAM_ROUTE) {
      return previewAudioResponse(pathname === TTS_STREAM_ROUTE)
    }
    return originalFetch(input, init)
  }
  return () => { globalThis.fetch = originalFetch; restoreSockets() }
}

/** Standalone previews exercise the real duplex consumer using a local synthetic tone. */
function installPreviewSockets(): () => void {
  const NativeSocket = globalThis.WebSocket
  const sockets = new Set<LocalSocket>()
  class LocalSocket extends EventTarget {
    readyState = 0
    binaryType = 'arraybuffer'
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onclose: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    constructor() {
      super()
      sockets.add(this)
      queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.(new Event('open')) } })
    }
    private emit(data: unknown): void { if (this.readyState === 1) this.onmessage?.(new MessageEvent('message', { data })) }
    send(raw: string): void {
      const command = JSON.parse(raw) as { type: string }
      queueMicrotask(() => {
        if (command.type === 'start') this.emit(JSON.stringify({ type: 'ready', sampleRate: 24000, channels: 1, sampleFormat: 's16le', format: 'pcm' }))
        if (command.type === 'text') this.emit(previewPcm())
        if (command.type === 'finish') { this.emit(JSON.stringify({ type: 'done' })); this.close() }
        if (command.type === 'cancel') this.close()
      })
    }
    close(): void {
      if (this.readyState === 3) return
      this.readyState = 3
      sockets.delete(this)
      queueMicrotask(() => this.onclose?.(new Event('close')))
    }
  }
  const PreviewSocket = function (url: string | URL, protocols?: string | string[]): WebSocket {
    if (new URL(url, window.location.href).pathname === TTS_DUPLEX_ROUTE) return new LocalSocket() as unknown as WebSocket
    return new NativeSocket(url, protocols)
  }
  Object.assign(PreviewSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  globalThis.WebSocket = PreviewSocket as unknown as typeof WebSocket
  return () => { for (const socket of sockets) socket.close(); globalThis.WebSocket = NativeSocket }
}
