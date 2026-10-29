import { prepareSpeechText } from './speech-text.js'
import {
  AbortableSentenceQueue,
  batchTtsStreamSegments,
  classifyLiveSpeechTransition,
  countTtsSpeechCharacters,
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  normalizeVoiceRate,
  splitCompletedTtsSentences,
  splitTtsSegments,
} from '../../shared.js'
import type { LiveSpeechCursor } from '../../shared.js'
import { streamPcmAudio } from '../../pcm-stream.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'
import type { LiveMessageIdentity, PlaybackStatus } from './types.js'
import type { AudioHistory } from '../history/audio-history.js'
import { PcmRecording } from '../history/pcm-recording.js'
import { DuplexPcmStream } from './duplex-pcm.js'
import { ttsSelection } from '../../types/providers.js'
import type { TtsSelection } from '../../types/providers.js'
import type { ResolvedTtsSettings } from '../../types/settings.js'

interface DuplexJob {
  text: string[]
  finished: boolean
  stream: DuplexPcmStream | null
  sessionId: string | null
  messageId: string | null
}

interface CompletedStreamPlayback {
  sessionId: string
  messageId: string
  audioStarted: boolean
  fallback: () => void
}

export class LiveSpeechController {
  isBusy = (): boolean => this.requestBusy || this.audioBusy || ['loading', 'playing', 'paused'].includes(this.status)
  constructor(private readonly history?: AudioHistory) {}
  private readonly audio = new PcmAudioQueue({
    onBusyChange: (busy) => {
      this.audioBusy = busy
      this.maybeFinishPlayback()
    },
    onPlaybackStart: () => this.setStatus('playing'),
  })
  private streamGeneration = 0
  private queue = this.createQueue()
  private active: LiveSpeechCursor | null = null
  private observed = ''
  private consumed = 0
  private pendingText = ''
  private handled = new Set<string>()
  private messageId: string | null = null
  private status: PlaybackStatus = 'idle'
  private sessionId: string | null = null
  private requestBusy = false
  private audioBusy = false
  private blockedTurn: string | null = null
  private readonly manuallyStoppedTurns = new Set<string>()
  private checkpointed = false
  private completed: CompletedStreamPlayback | null = null
  private audioStarted = false
  private fallbackHandler: ((cursor: LiveSpeechCursor, text: string) => void) | null = null
  private onStateChange: ((sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void) | null = null
  private playbackError: string | null = null
  private beforePlayback: (() => void) | null = null
  private voiceRate = 1
  private selection: TtsSelection = { provider: 'xiaomi', model: 'mimo-v2.5-tts', voice: '冰糖', voiceDesignPrompt: '' }
  private duplexAbort = new AbortController()
  private duplexJobs: DuplexJob[] = []
  private duplexStep: DuplexJob | null = null
  private duplexRunning = false
  private timeoutMs = 120000
  private maxPcmBytes = 32 * 1024 * 1024
  private maxTextLength = 12000

  configure(settings: ResolvedTtsSettings): void {
    const next = ttsSelection(settings)
    // Rate changes apply to the next playback without interrupting the current session.
    if (JSON.stringify({ ...next, voiceRate: undefined }) !== JSON.stringify({ ...this.selection, voiceRate: undefined })) this.interrupt()
    this.selection = next
    this.voiceRate = settings.voiceRate
    this.timeoutMs = settings.requestTimeoutMs
    this.maxPcmBytes = settings.maxPausedPcmBytes
    this.maxTextLength = settings.maxTextLength
    this.audio.setMaxPausedPcmBytes(settings.maxPausedPcmBytes)
  }

  isDuplex(): boolean { return this.selection.provider === 'doubao' }

  /** Close bounded read scopes before generation ends; final identity can arrive later. */
  finishInput(sessionId: string, turn: number, step: number): void {
    if (!this.isDuplex() || this.sessionId !== sessionId || this.active?.turn !== turn || this.active.step !== step) return
    this.drain(true)
    this.finishDuplexStep()
  }

  setStateChangeListener(listener: (sessionId: string, messageId: string, status: PlaybackStatus, error: string | null) => void): void {
    this.onStateChange = listener
  }

  setFallbackHandler(handler: ((cursor: LiveSpeechCursor, text: string) => void) | null): void { this.fallbackHandler = handler }

  setBeforePlayback(handler: (() => void) | null): void { this.beforePlayback = handler }

  setMaxPausedPcmBytes(value: number): void { this.audio.setMaxPausedPcmBytes(value) }

  setVolume(value: number): void { this.audio.setVolume(value) }

  setVoiceRate(value: number): void {
    this.voiceRate = normalizeVoiceRate(value)
    if (this.selection.provider === 'doubao') this.selection = { ...this.selection, voiceRate: this.voiceRate }
  }

  async pause(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'playing') return false
    const generation = this.streamGeneration
    this.setStatus('paused')
    try {
      await this.audio.pause()
      return this.sessionId === sessionId && generation === this.streamGeneration
    } catch {
      if (this.sessionId === sessionId && generation === this.streamGeneration) this.setStatus('playing')
      return false
    }
  }

  async resume(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'paused') return false
    const generation = this.streamGeneration
    try {
      await this.audio.resume()
      if (this.sessionId !== sessionId || generation !== this.streamGeneration) return false
      this.setStatus('playing')
      return true
    } catch {
      if (this.sessionId !== sessionId || generation !== this.streamGeneration) return false
      this.setStatus('error')
      this.replaceQueue()
      this.audio.stop()
      return false
    }
  }

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
    if (this.checkpointed && this.active !== null && this.cursorKey(this.active) === this.cursorKey(next) && !text.startsWith(this.observed)) {
      this.prime(sessionId, turn, step, text)
      return
    }
    this.beforePlayback?.()
    const transition = classifyLiveSpeechTransition(this.active, next)
    if (transition === 'new-turn' || (transition === 'same-step' && !text.startsWith(this.observed))) this.reset(next)
    else if (transition === 'same-turn') this.advanceSegment(next)
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

  /** Stream semantic segments of a completed preset-model reply, falling back only before playback starts. */
  playCompleted(sessionId: string, messageId: string, text: string, fallback: () => void): void {
    if (this.sessionId !== sessionId || text.length === 0) return
    this.beforePlayback?.()
    this.resetState()
    this.audio.setPlaybackRate(this.isDuplex() ? 1 : this.voiceRate)
    this.completed = { sessionId, messageId, audioStarted: false, fallback }
    this.audioStarted = false
    this.messageId = messageId
    this.setStatus('loading')
    if (this.isDuplex()) {
      this.enqueueDuplex(text)
      this.finishDuplexStep()
      return
    }
    for (const segment of splitTtsSegments(text)) this.queue.enqueue(segment)
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
    if (this.sessionId !== sessionId || this.active === null || this.cursorKey(this.active) !== key) return
    if (final.interrupted) {
      this.cancelSession(sessionId)
      return
    }
    if (final.text.startsWith(this.observed)) this.observed = final.text
    this.messageId = final.messageId
    if (this.duplexStep !== null) this.duplexStep.messageId = final.messageId
    this.reportStatus()
    this.drain(true)
    this.finishDuplexStep()
    this.handled.add(key)
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

  cancelSession(sessionId: string): void {
    if (this.sessionId === sessionId) this.cancel()
  }

  cancel(): void {
    this.blockedTurn = null
    this.resetState()
  }

  interrupt(): void {
    if (this.active !== null) this.blockedTurn = `${this.active.sessionId}:${this.active.turn}`
    this.resetState()
  }

  async dispose(): Promise<void> {
    this.cancel()
    this.handled.clear()
    this.manuallyStoppedTurns.clear()
    await this.audio.dispose()
  }

  private reset(next: LiveSpeechCursor): void {
    this.replaceQueue()
    this.audio.stop()
    this.audio.setPlaybackRate(this.isDuplex() ? 1 : this.voiceRate)
    this.beginSegment(next, false)
    this.setStatus('idle')
  }

  private advanceSegment(next: LiveSpeechCursor): void {
    this.drain(true)
    this.finishDuplexStep()
    this.duplexStep = null
    this.beginSegment(next, true)
  }

  private beginSegment(next: LiveSpeechCursor, preserveMessageId: boolean): void {
    this.checkpointed = false
    this.completed = null
    if (!preserveMessageId) this.audioStarted = false
    this.active = next
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    if (!preserveMessageId) this.messageId = null
  }

  private resetState(): void {
    this.checkpointed = false
    this.replaceQueue()
    this.audio.stop()
    this.active = null
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    this.setStatus('idle')
    this.messageId = null
    this.completed = null
    this.audioStarted = false
  }

  private cursorKey(cursor: LiveSpeechCursor): string {
    return `${cursor.sessionId}:${cursor.turn}:${cursor.step}`
  }

  private drain(flush: boolean): void {
    const { sentences, remainder, consumed, inCode } = splitCompletedTtsSentences(this.observed.slice(this.consumed))
    // Never read an unclosed code block aloud, even on flush.
    const ready = flush && !inCode && remainder.trim().length > 0 ? [...sentences, remainder] : sentences
    this.consumed += consumed
    this.stageSentences(ready, false)
    // A model may take a long time to emit the first sentence-ending mark.
    // Once the uncommitted prose is large enough, send it immediately so the
    // first PCM request starts while the assistant is still generating. Mark
    // the emitted prefix consumed to keep subsequent partial updates from
    // synthesizing the same prefix again.
    if (!flush && !inCode && remainder.trim().length > 0) {
      const preparedRemainder = prepareSpeechText(remainder)
      const needed = DEFAULT_TTS_SEGMENT_CHARACTERS - countTtsSpeechCharacters(this.pendingText)
      if (countTtsSpeechCharacters(preparedRemainder) >= needed) {
        const provisional = takeStreamChunk(remainder, needed)
        if (provisional.length > 0) {
          this.stageSentences([provisional], false)
          this.consumed += provisional.length
        }
      }
    }
    if (flush) this.consumed = this.observed.length
    if (flush) this.stageSentences([], true)
  }

  private stageSentences(sentences: readonly string[], flush: boolean): void {
    const prepared = sentences.map(prepareSpeechText).filter(text => countTtsSpeechCharacters(text) > 0)
    if (this.isDuplex()) {
      if (prepared.length > 0 && this.active !== null) this.handled.add(this.cursorKey(this.active))
      for (const text of prepared) this.enqueueDuplex(text)
      return
    }
    const batch = batchTtsStreamSegments(this.pendingText, prepared, flush)
    this.pendingText = batch.pending
    // Claim streamed replies before final settlement so completed autoplay cannot restart them.
    if (batch.requests.length > 0 && this.active !== null) this.handled.add(this.cursorKey(this.active))
    for (const request of batch.requests) this.queue.enqueue(request)
  }

  private createQueue(): AbortableSentenceQueue {
    const generation = this.streamGeneration
    return new AbortableSentenceQueue(
      (sentence, signal) => this.stream(sentence, signal, generation),
      {
        onBusyChange: (busy) => {
          if (generation !== this.streamGeneration) return
          this.requestBusy = busy
          if (busy && this.status === 'idle') this.setStatus('loading')
          this.maybeFinishPlayback()
        },
        onError: (error) => {
          if (generation === this.streamGeneration) this.handleStreamError(error)
        },
      },
    )
  }

  private replaceQueue(): void {
    this.streamGeneration += 1
    this.requestBusy = false
    this.queue.cancel()
    this.queue = this.createQueue()
    this.duplexAbort.abort()
    this.duplexAbort = new AbortController()
    this.duplexJobs = []
    this.duplexStep = null
    this.duplexRunning = false
  }

  private isCurrentStream(generation: number, signal: AbortSignal): boolean {
    return generation === this.streamGeneration && !signal.aborted
  }

  private async stream(sentence: string, signal: AbortSignal, generation: number): Promise<void> {
    if (!this.isCurrentStream(generation, signal)) return
    const recording = new PcmRecording()
    const sessionId = this.sessionId
    const messageId = this.messageId
    try {
      await streamPcmAudio(sentence, signal, async (pcm) => {
        if (!this.isCurrentStream(generation, signal)) return
        recording.append(pcm)
        await this.audio.enqueue(pcm)
      }, this.selection)
      if (this.isCurrentStream(generation, signal)) recording.save(this.history, {
        text: sentence, source: 'conversation',
        ...(sessionId === null ? {} : { sessionId }),
        ...(messageId === null ? {} : { messageId }),
      })
    } catch (error) {
      if (this.isCurrentStream(generation, signal)) throw error
    }
  }

  private handleStreamError(error: unknown): void {
    const autoplayBlocked = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'NotAllowedError'
    const completed = this.completed
    if (!autoplayBlocked && completed !== null && !completed.audioStarted) {
      const fallback = completed.fallback
      this.resetState()
      fallback()
      return
    }
    if (!autoplayBlocked && this.active !== null && !this.audioStarted && this.fallbackHandler !== null) {
      const fallback = this.fallbackHandler
      const cursor = this.active
      const text = this.observed
      this.resetState()
      fallback(cursor, text)
      return
    }
    if (this.active !== null) this.blockedTurn = `${this.active.sessionId}:${this.active.turn}`
    this.playbackError = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : error instanceof Error ? error.message : 'request-failed'
    this.setStatus('error')
    this.replaceQueue()
    this.audio.stop()
    void error
  }

  private enqueueDuplex(text: string): void {
    if (this.duplexStep?.finished) return
    if (this.duplexStep === null) {
      this.duplexStep = { text: [], finished: false, stream: null, sessionId: this.sessionId, messageId: this.messageId }
      this.duplexJobs.push(this.duplexStep)
    }
    const job = this.duplexStep
    job.text.push(text)
    try { job.stream?.append(text) } catch (error) { this.handleStreamError(error); return }
    if (!this.duplexRunning) void this.runDuplexJobs()
  }

  private finishDuplexStep(): void {
    const job = this.duplexStep
    if (job === null || job.finished) return
    job.finished = true
    void job.stream?.finish().catch(() => {})
  }

  private async runDuplexJobs(): Promise<void> {
    this.duplexRunning = true
    const generation = this.streamGeneration
    const signal = this.duplexAbort.signal
    this.requestBusy = true
    if (this.status === 'idle') this.setStatus('loading')
    try {
      while (this.duplexJobs.length && this.isCurrentStream(generation, signal)) {
        const job = this.duplexJobs[0]!
        const recording = new PcmRecording()
        job.stream = new DuplexPcmStream(this.selection, signal, async bytes => {
          if (!this.isCurrentStream(generation, signal)) return
          recording.appendBytes(bytes)
          await this.audio.enqueueBytes(bytes)
        }, this.maxPcmBytes, this.timeoutMs, this.maxTextLength)
        for (const text of job.text) job.stream.append(text)
        if (job.finished) void job.stream.finish().catch(() => {})
        await job.stream.done
        if (!this.isCurrentStream(generation, signal)) return
        recording.save(this.history, {
          text: job.text.join(''), source: 'conversation', voiceRateApplied: true,
          ...(job.sessionId === null ? {} : { sessionId: job.sessionId }),
          ...(job.messageId === null ? {} : { messageId: job.messageId }),
        })
        this.duplexJobs.shift()
      }
    } catch (error) {
      if (this.isCurrentStream(generation, signal)) this.handleStreamError(error)
    } finally {
      if (generation === this.streamGeneration) {
        this.duplexRunning = false
        this.requestBusy = false
        this.maybeFinishPlayback()
      }
    }
  }

  private maybeFinishPlayback(): void {
    if (!this.requestBusy && !this.audioBusy && (this.status === 'loading' || this.status === 'playing')) this.setStatus('idle')
  }

  private setStatus(status: PlaybackStatus): void {
    if (status !== 'error') this.playbackError = null
    if (this.status === status) return
    this.status = status
    if (status === 'playing') {
      this.audioStarted = true
      if (this.completed !== null) this.completed.audioStarted = true
    }
    this.reportStatus()
  }

  private reportStatus(): void {
    if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, this.status, this.playbackError)
  }
}

/** Wait for a complete word or number before ending a provisional chunk. */
function takeStreamChunk(value: string, target: number): string {
  let speechCharacters = 0
  let end = 0
  let previous = ''
  for (const character of value) {
    end += character.length
    if (/^[\p{L}\p{N}]$/u.test(character)) speechCharacters += 1
    const nextPoint = value.codePointAt(end)
    const next = nextPoint === undefined ? '' : String.fromCodePoint(nextPoint)
    if (speechCharacters >= target && !/\p{M}/u.test(next)) {
      const inWord = isStreamWordCharacter(character)
        && (next.length === 0 || isStreamWordCharacter(next))
      const beforeDecimal = /\p{N}/u.test(character) && /[.,]/u.test(next)
      const inDecimal = /[.,]/u.test(character) && /\p{N}/u.test(previous)
        && (next.length === 0 || /\p{N}/u.test(next))
      if (!inWord && !beforeDecimal && !inDecimal) return value.slice(0, end)
    }
    previous = character
  }
  return ''
}

function isStreamWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}\p{M}_'’\-]/u.test(value) && !/\p{Script=Han}/u.test(value)
}
