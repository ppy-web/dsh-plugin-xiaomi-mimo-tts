import {
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
  parseSseRecords,
  splitTtsSegments,
} from '../shared.js'
import type { TtsFormat, TtsLocalSpeechMode, TtsModel, TtsVoiceDesignPlaybackMode } from '../shared.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error'

export interface PreviewSettings {
  model: TtsModel
  localSpeechMode: TtsLocalSpeechMode
  localVoiceURI: string
  voice: string
  voiceDesignPrompt: string
  format: TtsFormat
  voiceDesignPlaybackMode: TtsVoiceDesignPlaybackMode
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

async function responseError(response: Response): Promise<Error> {
  let message = `request-${response.status}`
  try {
    const body = await response.json() as { message?: unknown; error?: unknown }
    if (typeof body.message === 'string') message = body.message
    else if (typeof body.error === 'string') message = body.error
  } catch {
    // Keep the status-derived fallback for non-JSON responses.
  }
  return new Error(message)
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

  constructor(private readonly onStatusChange: (status: PreviewStatus) => void) {}

  getStatus(): PreviewStatus { return this.status }

  async play(text: string, settings: PreviewSettings): Promise<void> {
    this.stop()
    const normalized = text.trim()
    if (normalized.length === 0) {
      this.publish('error')
      return
    }
    const generation = this.generation
    this.publish('loading')
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
        } catch (error) {
          if (settings.localSpeechMode !== 'auto' || generation !== this.generation || this.status === 'playing') throw error
          this.request = null
          this.requestBusy = false
          this.pcmBusy = false
          this.pcm.stop()
          this.publish('loading')
          await this.playLocal(normalized, settings.localVoiceURI, generation)
        }
      }
      if (generation === this.generation && this.status !== 'playing') this.publish('idle')
    } catch {
      if (generation === this.generation) {
        this.request = null
        this.requestBusy = false
        this.pcmBusy = false
        this.pcm.stop()
        this.publish('error')
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
    this.publish('idle')
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
    if (settings.model === 'mimo-v2.5-tts-voicedesign' && settings.voiceDesignPlaybackMode === 'segmented') {
      await this.playSegmented(text, settings, generation)
      return
    }
    if (settings.model !== 'mimo-v2.5-tts-voicedesign' && settings.format === 'pcm') {
      await this.playPcm(text, settings, generation)
      return
    }
    await this.playComplete(text, settings, generation, settings.format === 'wav' ? 'wav' : 'mp3')
  }

  private async playComplete(text: string, settings: PreviewSettings, generation: number, format: 'mp3' | 'wav'): Promise<void> {
    this.publish('loading')
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
        if (generation === this.generation) this.publish(error === undefined ? 'idle' : 'error')
        if (error === undefined) resolve()
        else reject(error)
      }
      this.finishAudio = () => finish()
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error('preview-audio-failed'))
      void audio.play().then(() => {
        if (generation === this.generation) this.publish('playing')
      }).catch(() => finish(new Error('preview-audio-blocked')))
    })
  }

  private async playSegmented(text: string, settings: PreviewSettings, generation: number): Promise<void> {
    for (const segment of splitTtsSegments(text)) {
      if (generation !== this.generation) return
      await this.playComplete(segment, settings, generation, 'wav')
    }
  }

  private async playPcm(text: string, settings: PreviewSettings, generation: number): Promise<void> {
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
    if (typeof window === 'undefined' || window.speechSynthesis === undefined) return Promise.reject(new Error('local-speech-unavailable'))
    const voice = browserVoice(voiceURI)
    if (voice === undefined) return Promise.reject(new Error('local-voice-unavailable'))
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
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
        if (generation === this.generation) this.publish(error === undefined ? 'idle' : 'error')
        if (error === undefined) resolve()
        else reject(error)
      }
      this.finishUtterance = () => finish()
      utterance.onstart = () => { if (generation === this.generation) this.publish('playing') }
      utterance.onend = () => finish()
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') finish()
        else finish(new Error('local-speech-failed'))
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
    if (!this.requestBusy && !this.pcmBusy && (this.status === 'loading' || this.status === 'playing')) this.publish('idle')
  }

  private publish(status: PreviewStatus): void {
    if (this.status === status) return
    this.status = status
    this.onStatusChange(status)
  }
}
