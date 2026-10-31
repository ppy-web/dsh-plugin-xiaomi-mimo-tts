import type { Context } from '@deepseek-ai/cordis'
import { encode, getDuration, getWavFileInfo } from 'silk-wasm'
import { prepareTtsText, resolveTtsSettings } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import type { SpeechAudio, SpeechArtifact, SpeechDeliveryAdapter, SpeechDeliveryContext, SpeechDeliveryResult, SpeechRequest, SpeechSynthesisService } from '../host-api.js'
import { prepareSpeechRequest, synthesizeCompleteAudio } from './complete-synthesis.js'
import type { SynthesisRuntime } from './complete-synthesis.js'
import { completeAudioFormat, CompleteAudioResponseError } from './validation.js'
import { TtsProviderError, safeProviderError } from './provider-error.js'
import { cleanupSpeechArtifacts, writeSpeechArtifact } from './speech-files.js'

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

  constructor(private readonly current: () => ResolvedTtsSettings, private readonly runtime: SynthesisRuntime = {}) {}

  private track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task)
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task))
    return task
  }

  synthesize(request: SpeechRequest): Promise<SpeechAudio> { return this.track(this.synthesizeAudio(request)) }

  private async synthesizeAudio(request: SpeechRequest): Promise<SpeechAudio> {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed')
    const controller = new AbortController()
    const cancel = () => controller.abort(request.signal?.reason)
    request.signal?.throwIfAborted()
    request.signal?.addEventListener('abort', cancel, { once: true })
    this.controllers.add(controller)
    let timeout: ReturnType<typeof setTimeout> | undefined
    let settings = resolveTtsSettings({})
    try {
      settings = resolveTtsSettings(this.current())
      const prepared = prepareSpeechRequest(settings, request)
      settings = prepared.settings
      const format = request.format ?? completeAudioFormat(settings)
      if (!['mp3', 'wav', 'silk'].includes(format)) throw new TtsProviderError('invalid-audio-format', 'Select MP3, WAV or SILK.', 400)
      if (settings.provider === 'xiaomi') timeout = setTimeout(() => controller.abort(new TtsProviderError('tts-timeout', 'Synthesis timed out.', 504)), settings.requestTimeoutMs)
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
      if (request.signal?.aborted) throw new TtsProviderError('tts-canceled', 'Speech synthesis canceled.', 499)
      if (error instanceof CompleteAudioResponseError) throw new TtsProviderError(error.code)
      if (controller.signal.aborted) throw new TtsProviderError(this.disposed ? 'speech-service-disposed' : 'tts-timeout', 'Speech synthesis stopped.', 504)
      const detail = safeProviderError(error, [settings.apiKey, settings.doubaoApiKey])
      throw new TtsProviderError(detail.error, detail.message, error instanceof TtsProviderError ? error.status : 502)
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
      this.controllers.delete(controller)
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
    try {
      if (id === 'file') {
        const artifact = await this.exportAudio({ ...request, signal })
        return { adapter: id, path: artifact.path }
      }
      const adapter = this.adapters.get(id)!
      signal.throwIfAborted()
      await adapter.check?.({ ...context, signal })
      signal.throwIfAborted()
      const text = request.splitLongText ? prepareTtsText(request.text) : request.text
      const limit = Math.floor(this.current().maxTextLength)
      if (request.splitLongText && (!Number.isFinite(limit) || limit < 1)) throw new TtsProviderError('invalid-text-limit')
      const chunks = request.splitLongText ? splitDeliveryText(text, limit) : [text]
      let result: SpeechDeliveryResult | undefined
      for (const chunk of chunks) {
        signal.throwIfAborted()
        const audio = await this.synthesize({ ...request, text: chunk, format: adapter.format, signal })
        signal.throwIfAborted()
        if (this.disposed || this.adapters.get(id) !== adapter) throw new TtsProviderError('speech-delivery-unavailable')
        result = await adapter.send(audio, { ...context, signal })
      }
      return result!
    } finally {
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
    for (const controller of this.controllers) controller.abort()
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
    const update = () => service.setAutomaticDeliveryEnabled('qqbot', config.current().qqbotEnabled === true)
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
function splitDeliveryText(text: string, limit: number): string[] {
  if (!text) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
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
    chunks.push(text.slice(offset, end))
    offset = end
  }
  return chunks
}
