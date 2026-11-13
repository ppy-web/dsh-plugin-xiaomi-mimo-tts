import { prepareSpeechText } from './speech-text.js'
import { AbortableSentenceQueue, batchTtsStreamText, classifyLiveSpeechTransition, normalizeVoiceRate, splitCompletedTtsSentences, splitTtsSegments } from '../../shared.js'
import type { LiveSpeechCursor, TtsLocalVoiceEngine } from '../../shared.js'
import type { LiveMessageIdentity, PlaybackStatus } from './types.js'
import { applySpeechVoiceRate } from './voice-rate.js'
import { fetchMossAudio, MossRequestError } from '../moss-service.js'
import { playMossAudio } from './moss-playback.js'
import type { MossAudioHandle } from './moss-playback.js'
import { mediaCaptionTiming, type ReadingCaptions } from './reading-captions.js'

function browserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || window.speechSynthesis === undefined) return []
  return window.speechSynthesis.getVoices()
}

function chooseVoice(value: string): SpeechSynthesisVoice | undefined {
  const voices = browserVoices()
  const language = typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN'
  return voices.find((voice) => voice.voiceURI === value)
    ?? voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase().split('-')[0] ?? 'zh'))
    ?? voices.find((voice) => voice.default)
    ?? voices[0]
}

export class LocalSpeechController {
  constructor(private readonly captions?: ReadingCaptions) {}
  isBusy = (): boolean => ['loading', 'playing', 'paused'].includes(this.status)
  private queue = this.createQueue()
  private generation = 0
  private active: LiveSpeechCursor | null = null
  private observed = ''
  private consumed = 0
  private pendingText = ''
  private handled = new Set<string>()
  private messageId: string | null = null
  private sessionId: string | null = null
  private status: PlaybackStatus = 'idle'
  private blockedTurn: string | null = null
  private readonly manuallyStoppedTurns = new Set<string>()
  private checkpointed = false
  private current: SpeechSynthesisUtterance | null = null
  private voiceURI = ''
  private localVoiceEngine: TtsLocalVoiceEngine = 'browser'
  private mossBaseURL = ''
  private mossVoice = ''
  private mossHandle: MossAudioHandle | null = null
  private timeoutMs = 120_000
  private onStateChange: ((sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void) | null = null
  private error: string | null = null
  private audioStarted = false
  private completedFallback: (() => void) | null = null
  private fallbackHandler: ((cursor: LiveSpeechCursor, text: string) => void) | null = null
  private beforePlayback: (() => void) | null = null
  private volume = 1
  private voiceRate = 1
  private activeVoiceRate = 1

  setStateChangeListener(listener: (sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void): void { this.onStateChange = listener }

  setVoiceURI(value: string): void { this.voiceURI = value }

  setMossVoice(engine: TtsLocalVoiceEngine, baseURL: string, voice: string): void {
    this.localVoiceEngine = engine
    this.mossBaseURL = baseURL
    this.mossVoice = voice
  }

  setTimeoutMs(value: number): void { this.timeoutMs = value }

  setFallbackHandler(handler: ((cursor: LiveSpeechCursor, text: string) => void) | null): void { this.fallbackHandler = handler }

  setBeforePlayback(handler: (() => void) | null): void { this.beforePlayback = handler }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    if (this.current !== null) this.current.volume = this.volume
  }

  setVoiceRate(value: number): void { this.voiceRate = normalizeVoiceRate(value) }

  activateSession(sessionId: string): void {
    if (this.sessionId === sessionId) return
    this.cancel()
    this.sessionId = sessionId
  }

  deactivateSession(sessionId: string): void {
    if (this.sessionId !== sessionId) return
    this.cancel()
    this.sessionId = null
  }

  observe(sessionId: string, turn: number, step: number, text: string): void {
    if (this.sessionId !== sessionId) return
    const next = { sessionId, turn, step }
    const turnKey = `${sessionId}:${turn}`
    if (this.blockedTurn === turnKey || this.manuallyStoppedTurns.has(turnKey)) return
    if (this.blockedTurn !== null && this.blockedTurn !== turnKey) this.blockedTurn = null
    if (this.checkpointed && this.active !== null && this.active.sessionId === sessionId && this.active.turn === turn && this.active.step === step && !text.startsWith(this.observed)) {
      this.prime(sessionId, turn, step, text)
      return
    }
    this.beforePlayback?.()
    const transition = classifyLiveSpeechTransition(this.active, next)
    if (transition === 'new-turn' || (transition === 'same-step' && !text.startsWith(this.observed))) this.reset(next)
    else if (transition === 'same-turn') this.advance(next)
    this.observed = text
    this.drain(false)
  }

  /** Skip text already present when attaching to a running conversation. */
  prime(sessionId: string, turn: number, step: number, text: string): void {
    if (this.sessionId !== sessionId || this.manuallyStoppedTurns.has(`${sessionId}:${turn}`)) return
    this.reset({ sessionId, turn, step })
    this.observed = text
    this.consumed = text.length
    this.checkpointed = true
  }

  finish(sessionId: string, final: LiveMessageIdentity): void {
    if (this.sessionId !== sessionId) return
    const key = `${sessionId}:${final.turn}:${final.step}`
    if (this.blockedTurn === `${sessionId}:${final.turn}` || this.manuallyStoppedTurns.has(`${sessionId}:${final.turn}`)) {
      this.messageId = final.messageId
      this.reportStatus()
      this.handled.add(key)
      return
    }
    if (this.sessionId !== sessionId || this.active === null || `${this.active.sessionId}:${this.active.turn}:${this.active.step}` !== key) return
    if (final.interrupted) { this.cancel(); return }
    if (final.text.startsWith(this.observed)) this.observed = final.text
    this.messageId = final.messageId
    this.reportStatus()
    this.drain(true)
    this.handled.add(key)
  }

  playCompleted(sessionId: string, messageId: string, text: string, fallback?: () => void): void {
    if (this.sessionId !== sessionId || text.length === 0) return
    this.beforePlayback?.()
    this.resetState()
    this.activeVoiceRate = this.voiceRate
    this.messageId = messageId
    this.completedFallback = fallback ?? null
    const segments = this.segments(text)
    if (segments.length === 0) {
      this.setStatus('error', 'no-text')
      return
    }
    this.setStatus('loading')
    for (const segment of segments) this.queue.enqueue(segment)
  }

  async pause(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'playing') return false
    if (this.localVoiceEngine === 'moss' && this.mossHandle !== null) {
      this.mossHandle.pause()
      this.setStatus('paused')
      return true
    }
    if (window.speechSynthesis === undefined) return false
    window.speechSynthesis.pause()
    this.setStatus('paused')
    return true
  }

  async resume(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'paused') return false
    if (this.localVoiceEngine === 'moss' && this.mossHandle !== null) {
      await this.mossHandle.resume()
      if (this.status === 'paused') this.setStatus('playing')
      return true
    }
    if (window.speechSynthesis === undefined) return false
    window.speechSynthesis.resume()
    this.setStatus('playing')
    return true
  }

  stop(sessionId: string): boolean {
    if (this.sessionId !== sessionId || (this.status !== 'loading' && this.status !== 'playing' && this.status !== 'paused')) return false
    if (this.active !== null) this.manuallyStoppedTurns.add(`${sessionId}:${this.active.turn}`)
    this.resetState()
    return true
  }

  blockTurn(sessionId: string, turn: number): void {
    if (this.sessionId !== sessionId) return
    this.manuallyStoppedTurns.add(`${sessionId}:${turn}`)
    if (this.active?.turn === turn) this.resetState()
  }

  hasHandled(sessionId: string, identity: Pick<LiveMessageIdentity, 'turn' | 'step'> | null): boolean {
    if (identity === null) return false
    return this.blockedTurn === `${sessionId}:${identity.turn}` || this.manuallyStoppedTurns.has(`${sessionId}:${identity.turn}`) || this.handled.has(`${sessionId}:${identity.turn}:${identity.step}`)
  }

  cancel(): void {
    this.blockedTurn = null
    this.resetState()
  }

  interrupt(): void {
    if (this.active !== null) this.blockedTurn = `${this.active.sessionId}:${this.active.turn}`
    this.resetState()
  }

  cancelSession(sessionId: string): void {
    if (this.sessionId === sessionId) this.cancel()
  }

  dispose(): void {
    this.cancel()
    this.handled.clear()
    this.manuallyStoppedTurns.clear()
    this.onStateChange = null
  }

  private reset(next: LiveSpeechCursor): void {
    this.resetState()
    this.activeVoiceRate = this.voiceRate
    this.active = next
    this.setStatus('idle')
  }

  private advance(next: LiveSpeechCursor): void {
    this.checkpointed = false
    this.drain(true)
    this.active = next
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
  }

  private resetState(): void {
    this.checkpointed = false
    this.generation += 1
    this.queue.cancel()
    this.mossHandle?.stop()
    this.mossHandle = null
    if (this.current !== null && typeof window !== 'undefined' && window.speechSynthesis !== undefined) window.speechSynthesis.cancel()
    this.current = null
    this.queue = this.createQueue()
    this.active = null
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    this.completedFallback = null
    this.audioStarted = false
    this.setStatus('idle')
    this.messageId = null
  }

  private drain(flush: boolean): void {
    const { sentences, remainder, consumed, inCode } = splitCompletedTtsSentences(this.observed.slice(this.consumed))
    const ready = flush && !inCode && remainder.trim().length > 0 ? [...sentences, remainder] : sentences
    this.consumed += consumed
    if (flush) this.consumed = this.observed.length
    for (const sentence of ready) {
      const text = prepareSpeechText(sentence)
      const batch = batchTtsStreamText(this.pendingText, text, false)
      this.pendingText = batch.pending
      if (batch.request !== null) this.enqueueLive(batch.request)
    }
    if (flush) {
      const text = prepareSpeechText(this.pendingText)
      this.pendingText = ''
      if (text.length > 0) this.enqueueLive(text)
    }
  }

  private enqueueLive(text: string): void {
    // Preserve automatic deduplication even if final settlement follows cancellation.
    if (this.active !== null) this.handled.add(`${this.active.sessionId}:${this.active.turn}:${this.active.step}`)
    this.queue.enqueue(text)
  }

  private segments(text: string): string[] {
    return splitTtsSegments(text)
  }

  private createQueue(): AbortableSentenceQueue {
    const generation = this.generation
    return new AbortableSentenceQueue(
      (text, signal) => this.speak(text, signal, generation),
      {
        onBusyChange: (busy) => {
          if (generation !== this.generation) return
          if (busy && this.status === 'idle') this.setStatus('loading')
          if (!busy && (this.status === 'loading' || this.status === 'playing')) this.setStatus('idle')
        },
        onError: (error) => {
          if (generation !== this.generation) return
          const code = error instanceof Error ? error.message : 'local-speech-failed'
          const canFallback = !this.audioStarted
          if (canFallback && this.completedFallback !== null) {
            const fallback = this.completedFallback
            this.resetState()
            fallback()
            return
          }
          if (canFallback && this.active !== null && this.fallbackHandler !== null) {
            const fallback = this.fallbackHandler
            const cursor = this.active
            const text = this.observed
            this.resetState()
            fallback(cursor, text)
            return
          }
          if (this.active !== null) this.blockedTurn = `${this.active.sessionId}:${this.active.turn}`
          this.setStatus('error', code)
        },
      },
    )
  }

  private speak(text: string, signal: AbortSignal, generation: number): Promise<void> {
    if (generation !== this.generation || signal.aborted) return Promise.resolve()
    if (this.localVoiceEngine === 'moss') return this.speakMoss(text, signal, generation)
    if (typeof window === 'undefined' || window.speechSynthesis === undefined) return Promise.reject(new Error('local-speech-unavailable'))
    const voice = chooseVoice(this.voiceURI)
    if (voice === undefined) return Promise.reject(new Error('local-voice-unavailable'))
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.volume = this.volume
      applySpeechVoiceRate(utterance, this.activeVoiceRate)
      this.current = utterance
      let settled = false
      let timeout: number | null = null
      let abort = (): void => {}
      const cleanup = (): void => {
        utterance.onstart = null
        utterance.onend = null
        utterance.onerror = null
        signal.removeEventListener('abort', abort)
        if (timeout !== null) window.clearTimeout(timeout)
        if (this.current === utterance) this.current = null
      }
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        if (this.current === utterance && generation === this.generation) this.captions?.clear(this)
        cleanup()
        if (error === undefined) resolve()
        else reject(error)
      }
      abort = (): void => {
        if (this.current === utterance) window.speechSynthesis.cancel()
        finish()
      }
      utterance.onstart = () => { if (generation === this.generation && !signal.aborted) { this.audioStarted = true; this.captions?.show(this, this.sessionId, text, { rate: this.activeVoiceRate }); this.setStatus('playing') } }
      utterance.onend = () => finish()
      utterance.onerror = (event) => {
        if (signal.aborted || event.error === 'canceled' || event.error === 'interrupted') finish()
        else finish(new Error(event.error === 'not-allowed'
          ? 'local-speech-not-allowed'
          : event.error === 'audio-busy'
            ? 'local-speech-audio-device'
            : 'local-speech-failed'))
      }
      signal.addEventListener('abort', abort, { once: true })
      timeout = window.setTimeout(() => {
        const current = this.current === utterance
        finish(new Error('local-speech-timeout'))
        if (current) window.speechSynthesis.cancel()
      }, this.timeoutMs)
      window.speechSynthesis.speak(utterance)
    })
  }

  /** Speak one sentence through the local MOSS server and play the returned WAV. */
  private async speakMoss(text: string, signal: AbortSignal, generation: number): Promise<void> {
    if (this.mossBaseURL.trim().length === 0) throw new Error('moss-invalid-url')
    if (this.mossVoice.trim().length === 0) throw new Error('moss-voice-required')
    let blob: Blob
    try {
      blob = await fetchMossAudio(text, { baseURL: this.mossBaseURL, voice: this.mossVoice }, signal)
    } catch (error) {
      if (signal.aborted || generation !== this.generation) return
      if (error instanceof MossRequestError) throw new Error(error.code)
      throw error
    }
    if (signal.aborted || generation !== this.generation) return
    const handle = playMossAudio(blob, {
      volume: this.volume,
      rate: this.activeVoiceRate,
      timeoutMs: this.timeoutMs,
      onStart: audio => {
        if (generation !== this.generation || signal.aborted) return
        this.audioStarted = true
        this.captions?.show(this, this.sessionId, text, mediaCaptionTiming(audio))
        this.setStatus('playing')
      },
    })
    this.mossHandle = handle
    const abort = (): void => { handle.stop() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      await handle.done
    } finally {
      signal.removeEventListener('abort', abort)
      if (this.mossHandle === handle) { this.mossHandle = null; this.captions?.clear(this) }
    }
  }

  private setStatus(status: PlaybackStatus, error: string | null = null): void {
    if (status === 'idle' || status === 'error') this.captions?.clear(this)
    if (status === 'paused' || status === 'playing') this.captions?.setPaused(this, status === 'paused')
    if (this.status === status && this.error === error) return
    this.status = status
    this.error = status === 'error' ? error : null
    this.reportStatus()
  }

  private reportStatus(): void {
    if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, this.status, this.error)
  }
}
