import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_STREAM_ROUTE,
  AbortableSentenceQueue,
  batchTtsStreamText,
  classifyLiveSpeechTransition,
  parseSseRecords,
  prepareTtsText,
  splitCompletedTtsSentences,
} from '../shared.js'
import type { LiveSpeechCursor } from '../shared.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'
import type { LiveMessageIdentity, PlaybackStatus } from './playback-types.js'

function pcmDeltaFromSse(data: string): string | null {
  if (data === '[DONE]') return null
  const value = JSON.parse(data) as {
    choices?: Array<{ delta?: { audio?: { data?: unknown } } }>
    error?: string | { message?: string }
  }
  const upstreamError = typeof value.error === 'string' ? value.error : value.error?.message
  if (upstreamError !== undefined) throw new Error(upstreamError)
  const pcm = value.choices?.[0]?.delta?.audio?.data
  return typeof pcm === 'string' && pcm.length > 0 ? pcm : null
}

interface CompletedStreamPlayback {
  sessionId: string
  messageId: string
  audioStarted: boolean
  fallback: () => void
}

export class LiveSpeechController {
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
  private completed: CompletedStreamPlayback | null = null
  private audioStarted = false
  private fallbackHandler: ((cursor: LiveSpeechCursor, text: string) => void) | null = null
  private onStateChange: ((sessionId: string, messageId: string, status: PlaybackStatus) => void) | null = null

  setStateChangeListener(listener: (sessionId: string, messageId: string, status: PlaybackStatus) => void): void {
    this.onStateChange = listener
  }

  setFallbackHandler(handler: ((cursor: LiveSpeechCursor, text: string) => void) | null): void { this.fallbackHandler = handler }

  setMaxPausedPcmBytes(value: number): void { this.audio.setMaxPausedPcmBytes(value) }

  async pause(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'playing') return false
    await this.audio.pause()
    this.setStatus('paused')
    return true
  }

  async resume(sessionId: string): Promise<boolean> {
    if (this.sessionId !== sessionId || this.status !== 'paused') return false
    try {
      await this.audio.resume()
      this.setStatus('playing')
      return true
    } catch {
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
    if (this.blockedTurn === turnKey) return
    if (this.blockedTurn !== null && this.blockedTurn !== turnKey) this.blockedTurn = null
    const transition = classifyLiveSpeechTransition(this.active, next)
    if (transition === 'new-turn' || (transition === 'same-step' && !text.startsWith(this.observed))) this.reset(next)
    else if (transition === 'same-turn') this.advanceSegment(next)
    this.observed = text
    this.drain(false)
  }

  /** Stream one already-completed preset-model reply as PCM, falling back only before playback starts. */
  playCompleted(sessionId: string, messageId: string, text: string, fallback: () => void): void {
    if (this.sessionId !== sessionId || text.length === 0) return
    this.resetState()
    this.completed = { sessionId, messageId, audioStarted: false, fallback }
    this.audioStarted = false
    this.messageId = messageId
    this.setStatus('loading')
    this.queue.enqueue(text)
  }

  finish(sessionId: string, final: LiveMessageIdentity): void {
    const key = `${sessionId}:${final.turn}:${final.step}`
    if (this.blockedTurn === `${sessionId}:${final.turn}`) {
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
    this.reportStatus()
    this.drain(true)
    this.handled.add(key)
  }

  stop(sessionId: string): boolean {
    if (this.sessionId !== sessionId || (this.status !== 'loading' && this.status !== 'playing')) return false
    if (this.active !== null) this.blockedTurn = `${sessionId}:${this.active.turn}`
    this.resetState()
    return true
  }

  hasHandled(sessionId: string, identity: Pick<LiveMessageIdentity, 'turn' | 'step'> | null): boolean {
    if (identity === null) return false
    return this.blockedTurn === `${sessionId}:${identity.turn}` || this.handled.has(`${sessionId}:${identity.turn}:${identity.step}`)
  }

  cancelSession(sessionId: string): void {
    if (this.sessionId === sessionId) this.cancel()
  }

  cancel(): void {
    this.blockedTurn = null
    this.resetState()
  }

  async dispose(): Promise<void> {
    this.cancel()
    this.handled.clear()
    await this.audio.dispose()
  }

  private reset(next: LiveSpeechCursor): void {
    this.replaceQueue()
    this.audio.stop()
    this.beginSegment(next, false)
    this.setStatus('idle')
  }

  private advanceSegment(next: LiveSpeechCursor): void {
    this.drain(true)
    this.beginSegment(next, true)
  }

  private beginSegment(next: LiveSpeechCursor, preserveMessageId: boolean): void {
    this.completed = null
    if (!preserveMessageId) this.audioStarted = false
    this.active = next
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    if (!preserveMessageId) this.messageId = null
  }

  private resetState(): void {
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
    if (flush) this.consumed = this.observed.length
    for (const sentence of ready) this.stageSentence(sentence, false)
    if (flush) this.stageSentence('', true)
  }

  private stageSentence(sentence: string, flush: boolean): void {
    const text = extractMarkdownPlainText(prepareTtsText(sentence)).trim()
    const batch = batchTtsStreamText(this.pendingText, text, flush)
    this.pendingText = batch.pending
    if (batch.request !== null) this.queue.enqueue(batch.request)
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
  }

  private isCurrentStream(generation: number, signal: AbortSignal): boolean {
    return generation === this.streamGeneration && !signal.aborted
  }

  private async stream(sentence: string, signal: AbortSignal, generation: number): Promise<void> {
    if (!this.isCurrentStream(generation, signal)) return
    try {
      const response = await fetch(TTS_STREAM_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
        signal,
      })
      if (!this.isCurrentStream(generation, signal)) return
      if (!response.ok) throw new Error(`stream-request-${response.status}`)
      if (response.body === null) throw new Error('stream-response-empty')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let receivedPcm = false
      const consume = async (events: string[]): Promise<void> => {
        for (const event of events) {
          if (!this.isCurrentStream(generation, signal)) return
          const pcm = pcmDeltaFromSse(event)
          if (pcm !== null) {
            await this.audio.enqueue(pcm)
            receivedPcm = true
            if (!this.isCurrentStream(generation, signal)) return
          }
        }
      }
      try {
        while (this.isCurrentStream(generation, signal)) {
          const result = await reader.read()
          if (result.done || !this.isCurrentStream(generation, signal)) break
          pending += decoder.decode(result.value, { stream: true })
          const parsed = parseSseRecords(pending)
          pending = parsed.remainder
          await consume(parsed.events)
        }
        pending += decoder.decode()
        if (pending.trim().length > 0) await consume(parseSseRecords(`${pending}\n\n`).events)
      } finally {
        reader.releaseLock()
      }
      if (!receivedPcm && this.isCurrentStream(generation, signal)) throw new Error('stream-audio-empty')
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
    this.setStatus('error')
    this.replaceQueue()
    this.audio.stop()
    void error
  }

  private maybeFinishPlayback(): void {
    if (!this.requestBusy && !this.audioBusy && (this.status === 'loading' || this.status === 'playing')) this.setStatus('idle')
  }

  private setStatus(status: PlaybackStatus): void {
    if (this.status === status) return
    this.status = status
    if (status === 'playing') {
      this.audioStarted = true
      if (this.completed !== null) this.completed.audioStarted = true
    }
    this.reportStatus()
  }

  private reportStatus(): void {
    if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, this.status)
  }
}
