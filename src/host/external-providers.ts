import type { ExternalSpeechConfigurationChange, ExternalSpeechProvider, ExternalSpeechProviderSnapshot, SpeechEngineState, SpeechRequest } from '../host-api.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { prepareExternalTtsText } from '../shared.js'
import { TtsProviderError } from './provider-error.js'
import { externalCatalog, externalRequestOptions, validateExternalSelection } from './external-catalog.js'

const revisionKey = Symbol.for('dsh-xiaomi-tts.engine-revision')
function nextRevision(): number {
  const state = globalThis as typeof globalThis & { [revisionKey]?: number }
  return state[revisionKey] = Math.max(Date.now(), (state[revisionKey] ?? 0) + 1)
}

/** Abort even when an adapter ignores cancellation, while observing its eventual rejection. */
export function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason ?? new TtsProviderError('tts-canceled', undefined, 499))
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}

function code(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/u.test(value) ? value : undefined
}

/** External errors never forward adapter prose, request IDs or upstream fields. */
export function externalError(error: unknown): TtsProviderError {
  return new TtsProviderError(error instanceof TtsProviderError ? code(error.code) ?? 'external-synthesis-failed' : 'external-synthesis-failed', undefined,
    error instanceof TtsProviderError && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502)
}

function snapshot(provider: ExternalSpeechProvider): ExternalSpeechProviderSnapshot {
  const value = provider.getSnapshot()
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120 || typeof value.ready !== 'boolean'
    || !Array.isArray(value.formats) || !value.formats.includes('wav') || value.formats.some(format => format !== 'wav' && format !== 'mp3')
    || !Number.isSafeInteger(value.maxTextLength) || value.maxTextLength < 1) throw new TtsProviderError('external-provider-invalid', undefined, 400)
  return {
    name: value.name.trim(), ready: value.ready, formats: [...new Set(value.formats)], maxTextLength: value.maxTextLength,
    ...(code(value.unavailableReason) ? { unavailableReason: code(value.unavailableReason)! } : {}),
    ...(typeof value.modelName === 'string' ? { modelName: value.modelName.slice(0, 120) } : {}),
    ...(typeof value.voiceName === 'string' ? { voiceName: value.voiceName.slice(0, 120) } : {}),
    ...externalCatalog(value),
    configurable: typeof provider.configure === 'function',
    configurationSwitchable: typeof provider.selectConfiguration === 'function',
  }
}

export class ExternalProviders {
  private active: { provider: ExternalSpeechProvider; state: ExternalSpeechProviderSnapshot; off: () => void } | undefined
  private readonly listeners = new Set<() => void>()
  private readonly jobs = new Set<AbortController>()
  revision = nextRevision()
  private disposed = false
  private configuring = false
  private enabled = true

  get id() { return this.enabled ? this.active?.provider.id : undefined }
  setEnabled(enabled: boolean): boolean {
    if (this.enabled === enabled) return false
    this.enabled = enabled
    this.changed()
    return true
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  changed(reason = new TtsProviderError('speech-engine-changed', undefined, 409)): void {
    this.revision = nextRevision()
    for (const controller of this.jobs) controller.abort(reason)
    for (const listener of this.listeners) listener()
  }

  state(settings: ResolvedTtsSettings): SpeechEngineState | undefined {
    if (!this.enabled || !this.active) return
    const state = structuredClone(this.active.state)
    const model = state.models?.find(item => item.id === state.selection?.model)
    return { ...state, provider: this.active.provider.id, revision: this.revision,
      maxTextLength: Math.min(settings.maxTextLength, state.maxTextLength), streaming: typeof this.active.provider.streamPcm === 'function' && (model?.streaming ?? true) }
  }

  async configure(change: ExternalSpeechConfigurationChange, settings: ResolvedTtsSettings, signal?: AbortSignal): Promise<SpeechEngineState> {
    const entry = this.active
    if (!this.enabled || !entry) throw new TtsProviderError('external-provider-unavailable', undefined, 409)
    if (this.configuring) throw new TtsProviderError('external-configuration-busy', undefined, 409)
    if ((change.configurationId === undefined) === (change.selection === undefined)) throw new TtsProviderError('external-selection-invalid', undefined, 400)
    let update: (signal: AbortSignal) => Promise<void>
    if (change.configurationId !== undefined) {
      if (!entry.provider.selectConfiguration) throw new TtsProviderError('external-option-unsupported', undefined, 400)
      if (!entry.state.configurations?.some(item => item.id === change.configurationId)) throw new TtsProviderError('external-selection-invalid', undefined, 400)
      update = signal => entry.provider.selectConfiguration!(change.configurationId!, { signal })
    } else {
      if (!entry.provider.configure) throw new TtsProviderError('external-option-unsupported', undefined, 400)
      validateExternalSelection(change.selection, entry.state.models)
      update = signal => entry.provider.configure!({ ...change.selection }, { signal })
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new TtsProviderError('tts-timeout', undefined, 504)), settings.requestTimeoutMs)
    const combined = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])])
    const off = this.subscribe(() => { if (!this.enabled || this.active !== entry) controller.abort(new TtsProviderError('speech-engine-changed', undefined, 409)) })
    this.configuring = true
    try {
      combined.throwIfAborted()
      await abortable(update(combined), combined)
      combined.throwIfAborted()
      if (this.active !== entry) throw new TtsProviderError('speech-engine-changed', undefined, 409)
      entry.state = snapshot(entry.provider)
      this.changed()
      return this.state(settings)!
    } catch (error) {
      if (combined.aborted && !(combined.reason instanceof TtsProviderError)) throw new TtsProviderError('tts-canceled', undefined, 499)
      throw externalError(combined.aborted ? combined.reason : error)
    }
    finally { clearTimeout(timeout); off(); this.configuring = false }
  }

  register(provider: ExternalSpeechProvider): () => void {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed', undefined, 503)
    if (this.active) throw new TtsProviderError('external-provider-conflict', undefined, 409)
    if (!provider || provider.apiVersion !== 1 || !/^external:[a-z0-9][a-z0-9._-]{0,119}$/u.test(provider.id)
      || typeof provider.subscribe !== 'function' || typeof provider.synthesize !== 'function'
      || (provider.streamPcm !== undefined && typeof provider.streamPcm !== 'function')) throw new TtsProviderError('external-provider-invalid', undefined, 400)
    let state: ExternalSpeechProviderSnapshot
    try { state = snapshot(provider) } catch { throw new TtsProviderError('external-provider-invalid', undefined, 400) }
    const entry = { provider, state, off: () => {} }
    // Reserve ownership before subscribing, so reentrant registration cannot overwrite it.
    this.active = entry
    try {
      entry.off = provider.subscribe(() => {
        if (this.active !== entry || this.disposed) return
        try { entry.state = snapshot(provider) } catch { entry.state = { ...entry.state, ready: false, unavailableReason: 'external-provider-invalid' } }
        if (this.enabled) this.changed()
      })
      if (typeof entry.off !== 'function') throw new TtsProviderError('external-provider-invalid', undefined, 400)
    } catch (error) { this.active = undefined; throw externalError(error) }
    if (this.enabled) this.changed()
    return () => {
      if (this.active !== entry) return
      this.active = undefined
      try { entry.off() } finally { if (this.enabled) this.changed() }
    }
  }

  async run<T>(request: SpeechRequest, settings: ResolvedTtsSettings, action: (provider: ExternalSpeechProvider, text: string, signal: AbortSignal, state: SpeechEngineState) => Promise<T>): Promise<T> {
    const entry = this.active
    if (!this.enabled || !entry || (request.provider !== undefined && request.provider !== entry.provider.id)) throw new TtsProviderError('external-provider-unavailable', undefined, 409)
    const state = this.state(settings)!
    if (!state.ready) throw new TtsProviderError(state.unavailableReason ?? 'external-provider-not-ready', undefined, 409)
    if (['voiceDesignPrompt', 'voiceRate'].some(key => request[key as keyof SpeechRequest] !== undefined)) throw new TtsProviderError('external-option-unsupported', undefined, 400)
    externalRequestOptions(request, state)
    if (typeof request.text !== 'string') throw new TtsProviderError('text-required', undefined, 400)
    const model = state.models?.find(model => model.id === (request.model ?? state.selection?.model))
    const text = prepareExternalTtsText(request.text, model?.audioTags?.map(tag => tag.value))
    if (!text.trim()) throw new TtsProviderError('text-required', undefined, 400)
    if (text.length > state.maxTextLength) throw new TtsProviderError('text-too-long', undefined, 413)
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, ...(request.signal ? [request.signal] : [])])
    if (signal.aborted) throw new TtsProviderError('tts-canceled', undefined, 499)
    this.jobs.add(controller)
    const timer = setTimeout(() => controller.abort(new TtsProviderError('tts-timeout', undefined, 504)), settings.requestTimeoutMs)
    try {
      const result = await abortable(Promise.resolve().then(() => action(entry.provider, text, signal, state)), signal)
      signal.throwIfAborted()
      return result
    } catch (error) {
      if (signal.aborted) {
        if (signal.reason instanceof TtsProviderError) throw signal.reason
        throw new TtsProviderError('tts-canceled', undefined, 499)
      }
      throw externalError(error)
    } finally { clearTimeout(timer); this.jobs.delete(controller); controller.abort() }
  }

  dispose(): void {
    this.disposed = true
    const entry = this.active
    this.active = undefined
    try { entry?.off() } finally { this.changed(new TtsProviderError('speech-service-disposed', undefined, 503)); this.listeners.clear() }
  }
}

/** Validate PCM WAV chunks, including sample alignment and declared lengths. */
export function validateExternalAudio(bytes: Uint8Array, format: 'wav' | 'mp3', limit: number): Buffer {
  if (!(bytes instanceof Uint8Array)) throw new TtsProviderError('invalid-audio-format')
  if (bytes.byteLength > limit) throw new TtsProviderError('audio-too-large', undefined, 413)
  const data = Buffer.from(bytes)
  const invalid = () => { throw new TtsProviderError('invalid-audio-format') }
  if (format === 'mp3') {
    if (!(data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 255 && (data[1]! & 224) === 224))) invalid()
    return data
  }
  if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE' || data.readUInt32LE(4) + 8 !== data.length) invalid()
  let alignment = 0
  let payload = 0
  let position = 12
  for (; position + 8 <= data.length;) {
    const kind = data.toString('ascii', position, position + 4)
    const size = data.readUInt32LE(position + 4)
    const start = position + 8
    if (start + size > data.length) invalid()
    if (kind === 'fmt ') {
      if (size < 16 || data.readUInt16LE(start) !== 1) invalid()
      const channels = data.readUInt16LE(start + 2)
      const rate = data.readUInt32LE(start + 4)
      const bits = data.readUInt16LE(start + 14)
      alignment = channels * bits / 8
      if (!channels || !rate || ![8, 16, 24, 32].includes(bits) || data.readUInt16LE(start + 12) !== alignment || data.readUInt32LE(start + 8) !== rate * alignment) invalid()
    }
    if (kind === 'data') { if (!alignment || !size || size % alignment) invalid(); payload += size }
    position = start + size + (size % 2)
  }
  if (!payload || position !== data.length) invalid()
  return data
}
