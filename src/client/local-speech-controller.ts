import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { AbortableSentenceQueue, batchTtsStreamText, classifyLiveSpeechTransition, prepareTtsText, splitCompletedTtsSentences, splitTtsSegments } from '../shared.js'
import type { LiveSpeechCursor } from '../shared.js'
import type { LiveMessageIdentity, PlaybackStatus } from './playback-types.js'

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
  private current: SpeechSynthesisUtterance | null = null
  private voiceURI = ''
  private timeoutMs = 120_000
  private onStateChange: ((sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void) | null = null
  private error: string | null = null
  private audioStarted = false
  private completedFallback: (() => void) | null = null
  private fallbackHandler: ((cursor: LiveSpeechCursor, text: string) => void) | null = null

  setStateChangeListener(listener: (sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void): void { this.onStateChange = listener }

  setVoiceURI(value: string): void { this.voiceURI = value }

  setTimeoutMs(value: number): void { this.timeoutMs = value }

  setFallbackHandler(handler: ((cursor: LiveSpeechCursor, text: string) => void) | null): void { this.fallbackHandler = handler }

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
    if (this.blockedTurn === turnKey) return
    if (this.blockedTurn !== null && this.blockedTurn !== turnKey) this.blockedTurn = null
    const transition = classifyLiveSpeechTransition(this.active, next)
    if (transition === 'new-turn' || (transition === 'same-step' && !text.startsWith(this.observed))) this.reset(next)
    else if (transition === 'same-turn') this.advance(next)
    this.observed = text
    this.drain(false)
  }

  finish(sessionId: string, final: LiveMessageIdentity): void {
    const key = `${sessionId}:${final.turn}:${final.step}`
    if (this.blockedTurn === `${sessionId}:${final.turn}`) { this.handled.add(key); return }
    if (this.sessionId !== sessionId || this.active === null || `${this.active.sessionId}:${this.active.turn}:${this.active.step}` !== key) return
    if (final.interrupted) { this.cancel(); return }
    if (final.text.startsWith(this.observed)) this.observed = final.text
    this.messageId = final.messageId
    this.drain(true)
    this.handled.add(key)
  }

  playCompleted(sessionId: string, messageId: string, text: string, fallback?: () => void): void {
    if (this.sessionId !== sessionId || text.length === 0) return
    this.resetState()
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
    if (this.sessionId !== sessionId || this.status !== 'playing' || window.speechSynthesis === undefined) return false
    window.speechSynthesis.pause()
    this.setStatus('paused')
    return true
  }

  async resume(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'paused' || window.speechSynthesis === undefined) return false
    window.speechSynthesis.resume()
    this.setStatus('playing')
    return true
  }

  stop(sessionId: string): boolean {
    if (this.sessionId !== sessionId || (this.status !== 'loading' && this.status !== 'playing' && this.status !== 'paused')) return false
    if (this.active !== null) this.blockedTurn = `${sessionId}:${this.active.turn}`
    this.resetState()
    return true
  }

  hasHandled(sessionId: string, identity: Pick<LiveMessageIdentity, 'turn' | 'step'> | null): boolean {
    if (identity === null) return false
    return this.blockedTurn === `${sessionId}:${identity.turn}` || this.handled.has(`${sessionId}:${identity.turn}:${identity.step}`)
  }

  cancel(): void {
    this.blockedTurn = null
    this.resetState()
  }

  cancelSession(sessionId: string): void {
    if (this.sessionId === sessionId) this.cancel()
  }

  dispose(): void {
    this.cancel()
    this.handled.clear()
    this.onStateChange = null
  }

  private reset(next: LiveSpeechCursor): void {
    this.resetState()
    this.active = next
    this.setStatus('idle')
  }

  private advance(next: LiveSpeechCursor): void {
    this.drain(true)
    this.active = next
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
  }

  private resetState(): void {
    this.generation += 1
    this.queue.cancel()
    if (this.current !== null && typeof window !== 'undefined' && window.speechSynthesis !== undefined) window.speechSynthesis.cancel()
    this.current = null
    this.queue = this.createQueue()
    this.active = null
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    this.messageId = null
    this.completedFallback = null
    this.audioStarted = false
    this.setStatus('idle')
  }

  private drain(flush: boolean): void {
    const { sentences, remainder, consumed, inCode } = splitCompletedTtsSentences(this.observed.slice(this.consumed))
    const ready = flush && !inCode && remainder.trim().length > 0 ? [...sentences, remainder] : sentences
    this.consumed += consumed
    if (flush) this.consumed = this.observed.length
    for (const sentence of ready) {
      const text = extractMarkdownPlainText(prepareTtsText(sentence)).trim()
      const batch = batchTtsStreamText(this.pendingText, text, false)
      this.pendingText = batch.pending
      if (batch.request !== null) this.queue.enqueue(batch.request)
    }
    if (flush) {
      const text = extractMarkdownPlainText(prepareTtsText(this.pendingText)).trim()
      this.pendingText = ''
      if (text.length > 0) this.queue.enqueue(text)
    }
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
          const canFallback = !this.audioStarted || code === 'local-speech-timeout'
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
          this.setStatus('error', code)
        },
      },
    )
  }

  private speak(text: string, signal: AbortSignal, generation: number): Promise<void> {
    if (generation !== this.generation || signal.aborted) return Promise.resolve()
    if (typeof window === 'undefined' || window.speechSynthesis === undefined) return Promise.reject(new Error('local-speech-unavailable'))
    const voice = chooseVoice(this.voiceURI)
    if (voice === undefined) return Promise.reject(new Error('local-voice-unavailable'))
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
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
        cleanup()
        if (error === undefined) resolve()
        else reject(error)
      }
      abort = (): void => {
        if (this.current === utterance) window.speechSynthesis.cancel()
        finish()
      }
      utterance.onstart = () => { if (generation === this.generation && !signal.aborted) { this.audioStarted = true; this.setStatus('playing') } }
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

  private setStatus(status: PlaybackStatus, error: string | null = null): void {
    if (this.status === status && this.error === error) return
    this.status = status
    this.error = status === 'error' ? error : null
    if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, status, this.error)
  }
}
