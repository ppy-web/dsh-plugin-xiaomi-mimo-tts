import {
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
  normalizeVoiceRate,
  parseSseRecords,
  splitTtsSegments,
} from '../../shared.js'
import type { TtsLocalSpeechMode, TtsModel } from '../../shared.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'
import { applyMediaVoiceRate, applySpeechVoiceRate } from './voice-rate.js'

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error'
export type PreviewSource = 'mimo' | 'local' | null
export type PreviewError = 'api-key-not-configured' | 'api-key-rejected' | 'rate-limited' | 'timeout' | 'local-voice-unavailable' | 'autoplay-blocked' | 'request-failed'

export interface PreviewView {
  status: PreviewStatus
  source: PreviewSource
  error: PreviewError | null
}

export interface PreviewSettings {
  model: TtsModel
  localSpeechMode: TtsLocalSpeechMode
  localVoiceURI: string
  voice: string
  voiceDesignPrompt: string
  voiceVolume: number
  voiceRate: number
}

interface PreviewRequestBody {
  text: string
  model: TtsModel
  voice: string
  voiceDesignPrompt: string
  format?: 'mp3' | 'wav'
}

function browserVoice(value: string): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || window.speechSynthesis === undefined) return undefined
  const voices = window.speechSynthesis.getVoices()
  const language = typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN'
  return voices.find((voice) => voice.voiceURI === value)
    ?? voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase().split('-')[0] ?? 'zh'))
    ?? voices.find((voice) => voice.default)
    ?? voices[0]
}

function pcmDelta(data: string): string | null {
  if (data === '[DONE]') return null
  const value = JSON.parse(data) as {
    choices?: Array<{ delta?: { audio?: { data?: unknown } } }>
    error?: string | { message?: string }
  }
  const error = typeof value.error === 'string' ? value.error : value.error?.message
  if (error !== undefined) throw new Error(error)
  const audio = value.choices?.[0]?.delta?.audio?.data
  return typeof audio === 'string' && audio.length > 0 ? audio : null
}

class PreviewPlaybackError extends Error {
  constructor(readonly code: PreviewError, message: string = code) {
    super(message)
  }
}

function previewError(error: unknown): PreviewError {
  return error instanceof PreviewPlaybackError ? error.code : 'request-failed'
}

async function responseError(response: Response): Promise<PreviewPlaybackError> {
  let upstreamCode = ''
  let message = `request-${response.status}`
  try {
    const body = await response.json() as { message?: unknown; error?: unknown }
    if (typeof body.error === 'string') upstreamCode = body.error
    if (typeof body.message === 'string') message = body.message
    else if (upstreamCode.length > 0) message = upstreamCode
  } catch {
    // Keep the status-derived fallback for non-JSON responses.
  }
  const code: PreviewError = response.status === 409 && upstreamCode === 'api-key-not-configured'
    ? 'api-key-not-configured'
    : response.status === 401 || response.status === 403
      ? 'api-key-rejected'
      : response.status === 429
        ? 'rate-limited'
        : response.status === 504 || upstreamCode === 'xiaomi-timeout'
          ? 'timeout'
          : 'request-failed'
  return new PreviewPlaybackError(code, message)
}

export class PreviewPlayer {
  private readonly pcm = new PcmAudioQueue({
    onBusyChange: (busy) => {
      this.pcmBusy = busy
      this.maybeFinishPcm()
    },
    onPlaybackStart: () => this.publish('playing'),
  })
  private generation = 0
  private request: AbortController | null = null
  private audio: HTMLAudioElement | null = null
  private audioUrl: string | null = null
  private finishAudio: (() => void) | null = null
  private utterance: SpeechSynthesisUtterance | null = null
  private finishUtterance: (() => void) | null = null
  private requestBusy = false
  private pcmBusy = false
  private status: PreviewStatus = 'idle'
  private source: PreviewSource = null
  private error: PreviewError | null = null
  private volume = 1
  private voiceRate = 1

  constructor(private readonly onViewChange: (view: PreviewView) => void) {}

  getView(): PreviewView { return { status: this.status, source: this.source, error: this.error } }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    this.pcm.setVolume(this.volume)
    if (this.audio !== null) this.audio.volume = this.volume
    if (this.utterance !== null) this.utterance.volume = this.volume
  }

  async play(text: string, settings: PreviewSettings): Promise<void> {
    this.stop()
    this.setVolume(settings.voiceVolume)
    this.voiceRate = normalizeVoiceRate(settings.voiceRate)
    this.pcm.setPlaybackRate(this.voiceRate)
    const normalized = text.trim()
    if (normalized.length === 0) {
      this.publish('error', null, 'request-failed')
      return
    }
    const generation = this.generation
    try {
      if (settings.localSpeechMode === 'local-first') {
        try {
          await this.playLocal(normalized, settings.localVoiceURI, generation)
        } catch {
          if (generation === this.generation) await this.playRemote(normalized, settings, generation)
        }
      } else {
        try {
          await this.playRemote(normalized, settings, generation)
        } catch (remoteError) {
          if (settings.localSpeechMode !== 'auto' || generation !== this.generation || this.status === 'playing') throw remoteError
          this.request = null
          this.requestBusy = false
          this.pcmBusy = false
          this.pcm.stop()
          try {
            await this.playLocal(normalized, settings.localVoiceURI, generation)
          } catch {
            throw remoteError
          }
        }
      }
      if (generation === this.generation && this.status !== 'playing') this.publish('idle', this.source)
    } catch (error) {
      if (generation === this.generation) {
        this.request = null
        this.requestBusy = false
        this.pcmBusy = false
        this.pcm.stop()
        this.publish('error', this.source, previewError(error))
      }
    }
  }

  stop(): void {
    this.generation += 1
    this.request?.abort()
    this.request = null
    this.requestBusy = false
    this.pcmBusy = false
    this.pcm.stop()
    this.finishAudio?.()
    this.finishAudio = null
    if (this.audio !== null) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
      this.audio = null
    }
    if (this.audioUrl !== null) {
      URL.revokeObjectURL(this.audioUrl)
      this.audioUrl = null
    }
    this.finishUtterance?.()
    this.finishUtterance = null
    if (this.utterance !== null && typeof window !== 'undefined' && window.speechSynthesis !== undefined) {
      window.speechSynthesis.cancel()
      this.utterance = null
    }
    this.publish('idle', null)
  }

  async dispose(): Promise<void> {
    this.stop()
    await this.pcm.dispose()
  }

  private requestBody(text: string, settings: PreviewSettings, format?: 'mp3' | 'wav'): PreviewRequestBody {
    return {
      text,
      model: settings.model,
      voice: settings.voice,
      voiceDesignPrompt: settings.voiceDesignPrompt,
      ...(format === undefined ? {} : { format }),
    }
  }

  private async playRemote(text: string, settings: PreviewSettings, generation: number): Promise<void> {
    if (settings.model === 'mimo-v2.5-tts-voicedesign') {
      if (splitTtsSegments(text).length > 1) await this.playSegmented(text, settings, generation)
      else await this.playComplete(text, settings, generation, 'mp3')
      return
    }
    await this.playPcm(text, settings, generation)
  }

  private async playComplete(text: string, settings: PreviewSettings, generation: number, format: 'mp3' | 'wav'): Promise<void> {
    this.publish('loading', 'mimo')
    const controller = new AbortController()
    this.request = controller
    const response = await fetch(TTS_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.requestBody(text, settings, format)),
      signal: controller.signal,
    })
    if (!response.ok) throw await responseError(response)
    const blob = await response.blob()
    if (generation !== this.generation) return
    this.request = null
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.volume = this.volume
    applyMediaVoiceRate(audio, this.voiceRate)
    this.audioUrl = url
    this.audio = audio
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        audio.onended = null
        audio.onerror = null
        if (this.finishAudio === finish) this.finishAudio = null
      }
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        this.releaseAudio(audio)
        if (generation === this.generation) {
          if (error === undefined) this.publish('idle', 'mimo')
          else this.publish('error', 'mimo', previewError(error))
        }
        if (error === undefined) resolve()
        else reject(error)
      }
      this.finishAudio = () => finish()
      audio.onended = () => finish()
      audio.onerror = () => finish(new PreviewPlaybackError('request-failed', 'preview-audio-failed'))
      void audio.play().then(() => {
        if (generation === this.generation) this.publish('playing', 'mimo')
      }).catch(() => finish(new PreviewPlaybackError('autoplay-blocked', 'preview-audio-blocked')))
    })
  }

  private async playSegmented(text: string, settings: PreviewSettings, generation: number): Promise<void> {
    for (const segment of splitTtsSegments(text)) {
      if (generation !== this.generation) return
      await this.playComplete(segment, settings, generation, 'wav')
    }
  }

  private async playPcm(text: string, settings: PreviewSettings, generation: number): Promise<void> {
    this.publish('loading', 'mimo')
    const controller = new AbortController()
    this.request = controller
    this.requestBusy = true
    const response = await fetch(TTS_STREAM_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.requestBody(text, settings)),
      signal: controller.signal,
    })
    if (!response.ok) throw await responseError(response)
    if (response.body === null) throw new Error('preview-stream-empty')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let received = false
    const consume = async (events: string[]): Promise<void> => {
      for (const event of events) {
        const delta = pcmDelta(event)
        if (delta !== null) {
          received = true
          await this.pcm.enqueue(delta)
        }
      }
    }
    try {
      while (generation === this.generation) {
        const result = await reader.read()
        if (result.done) break
        pending += decoder.decode(result.value, { stream: true })
        const parsed = parseSseRecords(pending)
        pending = parsed.remainder
        await consume(parsed.events)
      }
      pending += decoder.decode()
      if (pending.trim().length > 0) await consume(parseSseRecords(`${pending}\n\n`).events)
    } finally {
      reader.releaseLock()
      if (generation === this.generation) {
        this.request = null
        this.requestBusy = false
        this.maybeFinishPcm()
      }
    }
    if (!received && generation === this.generation) throw new Error('preview-stream-audio-empty')
  }

  private playLocal(text: string, voiceURI: string, generation: number): Promise<void> {
    this.publish('loading', 'local')
    if (typeof window === 'undefined' || window.speechSynthesis === undefined) return Promise.reject(new PreviewPlaybackError('local-voice-unavailable', 'local-speech-unavailable'))
    const voice = browserVoice(voiceURI)
    if (voice === undefined) return Promise.reject(new PreviewPlaybackError('local-voice-unavailable'))
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.volume = this.volume
      applySpeechVoiceRate(utterance, this.voiceRate)
      this.utterance = utterance
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        utterance.onstart = null
        utterance.onend = null
        utterance.onerror = null
        if (this.utterance === utterance) this.utterance = null
        if (this.finishUtterance === finish) this.finishUtterance = null
        if (generation === this.generation) {
          if (error === undefined) this.publish('idle', 'local')
          else this.publish('error', 'local', previewError(error))
        }
        if (error === undefined) resolve()
        else reject(error)
      }
      this.finishUtterance = () => finish()
      utterance.onstart = () => { if (generation === this.generation) this.publish('playing', 'local') }
      utterance.onend = () => finish()
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') finish()
        else if (event.error === 'not-allowed') finish(new PreviewPlaybackError('autoplay-blocked', 'local-speech-not-allowed'))
        else finish(new PreviewPlaybackError('request-failed', 'local-speech-failed'))
      }
      window.speechSynthesis.speak(utterance)
    })
  }

  private releaseAudio(audio: HTMLAudioElement): void {
    if (this.audio !== audio) return
    this.audio = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (this.audioUrl !== null) URL.revokeObjectURL(this.audioUrl)
    this.audioUrl = null
  }

  private maybeFinishPcm(): void {
    if (!this.requestBusy && !this.pcmBusy && (this.status === 'loading' || this.status === 'playing')) this.publish('idle', 'mimo')
  }

  private publish(status: PreviewStatus, source: PreviewSource = this.source, error: PreviewError | null = null): void {
    const nextError = status === 'error' ? error : null
    if (this.status === status && this.source === source && this.error === nextError) return
    this.status = status
    this.source = source
    this.error = nextError
    this.onViewChange(this.getView())
  }
}
