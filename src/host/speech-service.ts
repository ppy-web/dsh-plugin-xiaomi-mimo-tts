import type { Context } from '@deepseek-ai/cordis'
import { encode, getDuration, getWavFileInfo } from 'silk-wasm'
import { BREEZE_MAX_TEXT_LENGTH, prepareExternalTtsText, prepareProviderTtsText, supportsXiaomiAudioTags, XIAOMI_AUDIO_TAG_PATTERN, resolveTtsSettings, splitBreezeTtsSegments } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import type { ExternalSpeechProvider, SpeechEngineState, SpeechAudio, SpeechArtifact, SpeechDeliveryAdapter, SpeechDeliveryContext, SpeechDeliveryResult, SpeechRequest, SpeechSynthesisService } from '../host-api.js'
import { prepareSpeechRequest, synthesizeCompleteAudio } from './complete-synthesis.js'
import type { SynthesisRuntime } from './complete-synthesis.js'
import { completeAudioFormat, completeAudioLimit, CompleteAudioResponseError, synthesisOptions } from './validation.js'
import { TtsProviderError, safeProviderError } from './provider-error.js'
import { cleanupSpeechArtifacts, writeSpeechArtifact } from './speech-files.js'
import { speechCapabilities } from './capabilities.js'
import { abortable, ExternalProviders, validateExternalAudio } from './external-providers.js'
import { externalRequestOptions } from './external-catalog.js'
import type { ExternalSpeechConfigurationChange, SpeechProviderId } from '../host-api.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    qqbotSpeechRules: { current(): { maxAutoCharacters: number; maxDurationMs: number } }
  }
}

/** Host-only synthesis, with transport registration independent of the Web player. */
export class HostSpeechService implements SpeechSynthesisService {
  private readonly adapters = new Map<string, SpeechDeliveryAdapter>()
  private readonly controllers = new Set<AbortController>()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly disabledDeliveries = new Set<string>()
  private readonly deliveryJobs = new Map<string, Set<AbortController>>()
  private readonly automaticDeliveries = new Set<string>()
  private readonly automaticJobs = new Map<string, Set<AbortController>>()
  private disposed = false
  private readonly external = new ExternalProviders()
  private readonly defaultJobs = new Set<AbortController>()

  constructor(private readonly current: () => ResolvedTtsSettings, private readonly runtime: SynthesisRuntime = {}) {
    this.external.setEnabled(current().acceptExternalProviders !== false)
    this.external.subscribe(() => {
      for (const controller of this.defaultJobs) controller.abort(new TtsProviderError('speech-engine-changed', undefined, 409))
    })
  }

  registerProvider(provider: ExternalSpeechProvider): () => void { return this.external.register(provider) }
  subscribeEngine = (listener: () => void): (() => void) => this.external.subscribe(listener)
  refreshEngine(): void { if (!this.external.setEnabled(this.current().acceptExternalProviders !== false)) this.external.changed() }

  async configureProvider(request: { provider: SpeechProviderId; engineRevision: number; signal?: AbortSignal } & ExternalSpeechConfigurationChange): Promise<SpeechEngineState> {
    const id = this.resolveProvider(request)
    if (!id.startsWith('external:')) throw new TtsProviderError('external-option-unsupported', undefined, 400)
    return this.track(this.external.configure(request, this.current(), request.signal))
  }

  engineState(): SpeechEngineState {
    const settings = resolveTtsSettings(this.current())
    const external = this.external.state(settings)
    if (external) return external
    const current = speechCapabilities(settings).providers.find(provider => provider.id === settings.provider)!
    return { provider: settings.provider, revision: this.external.revision, name: settings.provider, ready: current.ready,
      ...(current.unavailableReason ? { unavailableReason: current.unavailableReason } : {}),
      formats: ['mp3', 'wav'], maxTextLength: current.maxTextLength,
      streaming: current.models.find(model => model.id === current.selectedModel)?.streaming ?? false }
  }

  resolveProvider(request: Pick<SpeechRequest, 'provider' | 'engineRevision'>) {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed', undefined, 503)
    if (request.provider !== undefined && typeof request.provider !== 'string') throw new TtsProviderError('invalid-provider', undefined, 400)
    if (request.engineRevision !== undefined && (!Number.isSafeInteger(request.engineRevision) || request.engineRevision !== this.external.revision)) throw new TtsProviderError('speech-engine-changed', undefined, 409)
    const id = request.provider ?? this.currentProvider()
    if (!['xiaomi', 'doubao', 'breeze'].includes(id)) {
      if (typeof id !== 'string' || !id.startsWith('external:')) throw new TtsProviderError('invalid-provider', undefined, 400)
      if (id !== this.external.id) throw new TtsProviderError('external-provider-unavailable', undefined, 409)
    }
    return id
  }

  async streamPcm(request: SpeechRequest, consume: (bytes: Uint8Array) => void | Promise<void>): Promise<void> {
    this.resolveProvider(request)
    return this.track(this.external.run(request, this.current(), async (provider, text, signal, state) => {
      if (!provider.streamPcm) throw new TtsProviderError('streaming-model-unsupported', undefined, 409)
      if (!state.streaming) throw new TtsProviderError('streaming-model-unsupported', undefined, 409)
      if (state.models?.find(model => model.id === (request.model ?? state.selection?.model))?.streaming === false) throw new TtsProviderError('streaming-model-unsupported', undefined, 409)
      const iterator = provider.streamPcm({ text, signal, ...externalRequestOptions(request, state) })[Symbol.asyncIterator]()
      let carry = Buffer.alloc(0)
      let size = 0
      try {
        while (true) {
          const chunk = await abortable(iterator.next(), signal)
          if (chunk.done) break
          if (!(chunk.value instanceof Uint8Array)) throw new TtsProviderError('invalid-audio-format')
          const bytes = Buffer.concat([carry, chunk.value])
          if (!size && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') throw new TtsProviderError('invalid-audio-format')
          size += chunk.value.byteLength
          if (size > this.current().maxWavAudioBytes) throw new TtsProviderError('audio-too-large', undefined, 413)
          const aligned = bytes.length - bytes.length % 2
          carry = bytes.subarray(aligned)
          if (aligned) await abortable(Promise.resolve(consume(bytes.subarray(0, aligned))), signal)
        }
        if (!size || carry.length) throw new TtsProviderError('invalid-audio-format')
      } finally { void iterator.return?.().catch(() => {}) }
    }))
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task)
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task))
    return task
  }

  currentProvider() { return this.external.id ?? resolveTtsSettings(this.current()).provider }

  capabilities() {
    const capabilities = speechCapabilities(resolveTtsSettings(this.current()))
    const state = this.external.state(this.current())
    if (!state) return capabilities
    return { ...capabilities, engine: state, provider: state.provider, formats: [...state.formats, 'silk' as const], providers: [...capabilities.providers, {
      id: state.provider, configured: state.ready, ready: state.ready, ...(state.unavailableReason ? { unavailableReason: state.unavailableReason } : {}),
      selectedModel: state.selection?.model ?? state.modelName ?? '', selectedVoice: state.selection?.voice ?? state.voiceName ?? '', maxTextLength: state.maxTextLength,
      models: (state.models ?? []).map(model => ({ id: model.id, voices: model.voices, customVoice: false, voiceDesign: false,
        speechInstruction: model.speechInstruction === true, audioTags: !!model.audioTags?.length, voiceRate: false, streaming: model.streaming === true, duplex: false })),
    }] }
  }

  supportsAudioTags(): boolean {
    if (this.external.id) { const state = this.external.state(this.current()); return !!state?.models?.find(model => model.id === state.selection?.model)?.audioTags?.length }
    const settings = this.current()
    return settings.provider === 'breeze' || supportsXiaomiAudioTags(settings)
  }

  synthesize(request: SpeechRequest): Promise<SpeechAudio> { return this.track(this.synthesizeAudio(request)) }

  private async synthesizeAudio(request: SpeechRequest): Promise<SpeechAudio> {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed')
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TtsProviderError('invalid-request', undefined, 400)
    const selected = this.resolveProvider(request)
    if (selected.startsWith('external:')) return this.external.run(request, this.current(), async (provider, text, signal, state) => {
      const format = request.format ?? (state.formats.includes('mp3') ? 'mp3' : 'wav')
      const upstreamFormat = format === 'silk' ? 'wav' : format
      if (!state.formats.includes(upstreamFormat)) throw new TtsProviderError('audio-format-unsupported', undefined, 400)
      const result = await provider.synthesize({ text, format: upstreamFormat, signal, ...externalRequestOptions(request, state) })
      signal.throwIfAborted()
      if (!result || result.format !== upstreamFormat) throw new TtsProviderError('invalid-audio-format')
      const data = validateExternalAudio(result.data, upstreamFormat, completeAudioLimit(this.current(), upstreamFormat))
      let durationMs: number | undefined
      if (upstreamFormat === 'wav') {
        const info = getWavFileInfo(data)
        durationMs = info.chunkInfo.filter(chunk => chunk.chunkId === 'data').reduce((size, chunk) => size + chunk.dataLength, 0) / info.fmt.bytesPerSec * 1000
      }
      if (request.maxDurationMs !== undefined) {
        if (!Number.isFinite(request.maxDurationMs) || request.maxDurationMs <= 0) throw new TtsProviderError('invalid-duration-limit', undefined, 400)
        if (durationMs === undefined) throw new TtsProviderError('duration-unavailable', undefined, 400)
        if (durationMs > request.maxDurationMs) throw new TtsProviderError('speech-too-long', undefined, 413)
      }
      if (format === 'silk') {
        const result = await encode(data, 0)
        signal.throwIfAborted()
        const durationMs = getDuration(result.data)
        if (request.maxDurationMs !== undefined && durationMs > request.maxDurationMs) throw new TtsProviderError('speech-too-long', undefined, 413)
        return { data: Buffer.from(result.data), text, provider: provider.id, format, contentType: 'audio/silk', durationMs }
      }
      return { data, text, provider: provider.id, format, contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg', ...(durationMs === undefined ? {} : { durationMs }) }
    })
    const controller = new AbortController()
    const cancel = () => controller.abort(request.signal?.reason)
    request.signal?.throwIfAborted()
    request.signal?.addEventListener('abort', cancel, { once: true })
    this.controllers.add(controller)
    if (request.provider === undefined || request.engineRevision !== undefined) this.defaultJobs.add(controller)
    let timeout: ReturnType<typeof setTimeout> | undefined
    let settings = resolveTtsSettings({})
    try {
      settings = resolveTtsSettings(this.current())
      const prepared = prepareSpeechRequest(settings, { ...request, provider: selected })
      settings = prepared.settings
      const format = request.format ?? completeAudioFormat(settings)
      if (!['mp3', 'wav', 'silk'].includes(format)) throw new TtsProviderError('invalid-audio-format', 'Select MP3, WAV or SILK.', 400)
      if (settings.provider !== 'doubao') timeout = setTimeout(() => controller.abort(new TtsProviderError('tts-timeout', 'Synthesis timed out.', 504)), settings.requestTimeoutMs)
      const data = await synthesizeCompleteAudio(settings, prepared.text, format === 'silk' ? 'wav' : format, controller, this.runtime)
      controller.signal.throwIfAborted()
      let durationMs: number | undefined
      if (format !== 'mp3') {
        const info = getWavFileInfo(data)
        const bytes = info.chunkInfo.filter(chunk => chunk.chunkId === 'data').reduce((size, chunk) => size + chunk.dataLength, 0)
        if (!Number.isFinite(info.fmt.bytesPerSec) || info.fmt.bytesPerSec <= 0) throw new TtsProviderError('invalid-audio-format')
        durationMs = bytes / info.fmt.bytesPerSec * 1000
      }
      if (request.maxDurationMs !== undefined) {
        if (!Number.isFinite(request.maxDurationMs) || request.maxDurationMs <= 0) throw new TtsProviderError('invalid-duration-limit', 'Invalid speech duration limit.', 400)
        if (durationMs === undefined) throw new TtsProviderError('duration-unavailable', 'Use WAV or SILK when limiting speech duration.', 400)
        if (durationMs > request.maxDurationMs) throw new TtsProviderError('speech-too-long', 'Speech exceeds the duration limit. Select a shorter passage.', 413)
      }
      if (format === 'silk') {
        const silk = await encode(data, 0)
        controller.signal.throwIfAborted()
        const durationMs = getDuration(silk.data)
        if (request.maxDurationMs !== undefined && durationMs > request.maxDurationMs) throw new TtsProviderError('speech-too-long', 'Speech exceeds the duration limit. Select a shorter passage.', 413)
        return { data: Buffer.from(silk.data), text: prepared.text, provider: settings.provider, format, contentType: 'audio/silk', durationMs }
      }
      return { data, text: prepared.text, provider: settings.provider, format, contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg', ...(durationMs === undefined ? {} : { durationMs }) }
    } catch (error) {
      if (controller.signal.reason instanceof TtsProviderError && controller.signal.reason.code === 'speech-engine-changed') throw controller.signal.reason
      if (request.signal?.aborted) throw new TtsProviderError('tts-canceled', 'Speech synthesis canceled.', 499)
      if (error instanceof CompleteAudioResponseError) throw new TtsProviderError(error.code)
      if (controller.signal.aborted) throw new TtsProviderError(this.disposed ? 'speech-service-disposed' : 'tts-timeout', 'Speech synthesis stopped.', 504)
      const detail = safeProviderError(error, [settings.apiKey, settings.doubaoApiKey, settings.breezeApiKey])
      throw new TtsProviderError(detail.error, detail.message, error instanceof TtsProviderError ? error.status : 502)
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
      this.controllers.delete(controller)
      this.defaultJobs.delete(controller)
      controller.abort()
    }
  }

  exportAudio(request: SpeechRequest): Promise<SpeechArtifact> { return this.track(this.exportArtifact(request)) }

  private async exportArtifact(request: SpeechRequest): Promise<SpeechArtifact> {
    const audio = await this.synthesize(request)
    request.signal?.throwIfAborted()
    const artifact = await writeSpeechArtifact(audio)
    if (request.signal?.aborted || this.disposed) { await artifact.remove(); throw new TtsProviderError('tts-canceled') }
    return artifact
  }

  registerDelivery(adapter: SpeechDeliveryAdapter): () => void {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed')
    if (!adapter.id || adapter.id === 'file' || this.adapters.has(adapter.id)) throw new Error(`Speech delivery already registered or reserved: ${adapter.id}`)
    this.adapters.set(adapter.id, adapter)
    return () => {
      if (this.adapters.get(adapter.id) !== adapter) return
      this.adapters.delete(adapter.id)
      for (const controller of this.deliveryJobs.get(adapter.id) ?? []) controller.abort()
    }
  }

  hasDelivery(id: string): boolean { return !this.disposed && !this.disabledDeliveries.has(id) && (id === 'file' || this.adapters.has(id)) }

  setDeliveryEnabled(id: string, enabled: boolean): void {
    if (enabled) this.disabledDeliveries.delete(id)
    else {
      this.disabledDeliveries.add(id)
      for (const controller of this.deliveryJobs.get(id) ?? []) controller.abort()
    }
  }

  isAutomaticDeliveryEnabled(id: string): boolean { return this.hasDelivery(id) && this.automaticDeliveries.has(id) }

  setAutomaticDeliveryEnabled(id: string, enabled: boolean): void {
    if (enabled) this.automaticDeliveries.add(id)
    else {
      this.automaticDeliveries.delete(id)
      for (const controller of this.automaticJobs.get(id) ?? []) controller.abort()
    }
  }

  deliver(request: SpeechRequest, id: string, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult> {
    return this.track(this.deliverAudio(request, id, context))
  }

  private async deliverAudio(request: SpeechRequest, id: string, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult> {
    if (!this.hasDelivery(id)) throw new TtsProviderError('speech-delivery-unavailable', `Speech delivery unavailable: ${id}`, 409)
    if (context.automatic && !this.isAutomaticDeliveryEnabled(id)) throw new TtsProviderError('automatic-speech-disabled', 'Automatic speech is disabled.', 409)
    const controller = new AbortController()
    this.controllers.add(controller)
    const jobs = this.deliveryJobs.get(id) ?? new Set<AbortController>()
    this.deliveryJobs.set(id, jobs)
    jobs.add(controller)
    const automaticJobs = this.automaticJobs.get(id) ?? new Set<AbortController>()
    if (context.automatic) { this.automaticJobs.set(id, automaticJobs); automaticJobs.add(controller) }
    const signal = AbortSignal.any([controller.signal, context.signal, ...(request.signal ? [request.signal] : [])])
    const engineRevision = this.external.revision
    const offEngine = request.provider === undefined || request.provider.startsWith('external:') || request.engineRevision !== undefined
      ? this.subscribeEngine(() => controller.abort(new TtsProviderError('speech-engine-changed', undefined, 409))) : () => {}
    try {
      if (id === 'file') {
        const artifact = await this.exportAudio({ ...request, signal })
        return { adapter: id, path: artifact.path }
      }
      const adapter = this.adapters.get(id)!
      signal.throwIfAborted()
      await adapter.check?.({ ...context, signal })
      signal.throwIfAborted()
      const selected = this.resolveProvider(request)
      const external = selected.startsWith('external:') ? this.external.state(this.current()) : undefined
      const settings = external ? this.current() : synthesisOptions(this.current(), { ...request, provider: selected })
      const externalTags = external?.models?.find(model => model.id === (request.model ?? external.selection?.model))?.audioTags?.map(tag => tag.value) ?? []
      const text = request.splitLongText ? (external ? prepareExternalTtsText(request.text, externalTags) : prepareProviderTtsText(request.text, settings)) : request.text
      if (request.splitLongText && !text) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
      const configuredLimit = Math.floor(settings.maxTextLength)
      const limit = external ? Math.min(configuredLimit, external.maxTextLength) : settings.provider === 'breeze' ? Math.min(configuredLimit, BREEZE_MAX_TEXT_LENGTH) : configuredLimit
      if (request.splitLongText && (!Number.isFinite(limit) || limit < 1)) throw new TtsProviderError('invalid-text-limit')
      const chunks = request.splitLongText ? (!external && settings.provider === 'breeze' ? splitBreezeTtsSegments(text, limit) : splitDeliveryText(text, limit, !external && supportsXiaomiAudioTags(settings), externalTags)) : [text]
      let result: SpeechDeliveryResult | undefined
      for (const chunk of chunks) {
        signal.throwIfAborted()
        const audio = await this.synthesize({ ...request, provider: selected, engineRevision, text: chunk, format: adapter.format, signal })
        signal.throwIfAborted()
        if (this.disposed || this.adapters.get(id) !== adapter) throw new TtsProviderError('speech-delivery-unavailable')
        result = await adapter.send(audio, { ...context, signal })
      }
      return result!
    } finally {
      offEngine()
      jobs.delete(controller)
      if (!jobs.size) this.deliveryJobs.delete(id)
      if (context.automatic) {
        automaticJobs.delete(controller)
        if (!automaticJobs.size) this.automaticJobs.delete(id)
      }
      this.controllers.delete(controller)
      controller.abort()
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const controller of this.controllers) controller.abort(new TtsProviderError('speech-service-disposed', undefined, 503))
    this.external.dispose()
    this.adapters.clear()
    await Promise.allSettled(this.pending)
  }
}

export default class SpeechHost {
  constructor(ctx: Context, config: { current: () => ResolvedTtsSettings; updates?: (listener: () => void) => (() => void) }) {
    const service = new HostSpeechService(config.current)
    ctx.provide('speechSynthesis', service)
    ctx.provide('qqbotSpeechRules', { current: () => ({
      maxAutoCharacters: config.current().qqbotMaxAutoCharacters ?? 0,
      maxDurationMs: (config.current().qqbotMaxDurationSeconds ?? 0) * 1000,
    }) })
    const update = () => { service.setAutomaticDeliveryEnabled('qqbot', config.current().qqbotEnabled === true); service.refreshEngine() }
    update()
    if (config.updates) ctx.effect(() => config.updates!(update))
    const clean = () => cleanupSpeechArtifacts().catch(() => ctx.logger.warn('Speech audio cleanup failed.'))
    ctx.effect(() => {
      void clean()
      const timer = setInterval(() => { void clean() }, 60 * 60 * 1000)
      timer.unref()
      return () => { clearInterval(timer); return service.dispose() }
    })
  }
}

/** Prefer sentence boundaries, falling back to a hard provider-sized request without dropping text. */
function splitDeliveryText(text: string, limit: number, preserveTags = false, externalTags: string[] = []): string[] {
  if (!text) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
  const tags: { index: number; 0: string }[] = preserveTags ? [...text.matchAll(XIAOMI_AUDIO_TAG_PATTERN)] : []
  for (const value of externalTags) {
    let start = 0
    while (value && (start = text.indexOf(value, start)) >= 0) { tags.push({ index: start, 0: value }); start += value.length }
  }
  const chunks: string[] = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(offset + limit, text.length)
    if (end < text.length) {
      const candidate = text.slice(offset, end)
      const boundaries = [...candidate.matchAll(/[.!?;,\s]/gu)]
      const boundary = boundaries.at(-1)
      if (boundary && boundary.index >= candidate.length / 2) end = offset + boundary.index + boundary[0].length
      // Avoid splitting a supplementary character if a caller's configured limit permits it.
      if (end > offset + 1 && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--
    }
    const tag = tags.find(tag => end > tag.index && end < tag.index + tag[0].length)
    if (tag) {
      if (tag.index === offset) throw new TtsProviderError('text-too-long', 'Audio tag exceeds the configured limit.', 413)
      end = tag.index
    }
    chunks.push(text.slice(offset, end))
    offset = end
  }
  return chunks
}
