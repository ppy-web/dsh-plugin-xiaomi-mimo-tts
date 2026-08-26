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
  try {
    const value = JSON.parse(data) as { choices?: Array<{ delta?: { audio?: { data?: unknown } } }> }
    const pcm = value.choices?.[0]?.delta?.audio?.data
    return typeof pcm === 'string' && pcm.length > 0 ? pcm : null
  } catch {
    return null
  }
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
  private onStateChange: ((sessionId: string, messageId: string, status: PlaybackStatus) => void) | null = null

  setStateChangeListener(listener: (sessionId: string, messageId: string, status: PlaybackStatus) => void): void {
    this.onStateChange = listener
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
    if (this.sessionId !== sessionId || this.active === null || (this.status !== 'loading' && this.status !== 'playing')) return false
    this.blockedTurn = `${sessionId}:${this.active.turn}`
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
    this.messageId = null
    this.setStatus('idle')
  }

  private cursorKey(cursor: LiveSpeechCursor): string {
    return `${cursor.sessionId}:${cursor.turn}:${cursor.step}`
  }

  private drain(flush: boolean): void {
    const { sentences, remainder } = splitCompletedTtsSentences(this.observed.slice(this.consumed))
    const ready = flush && remainder.trim().length > 0 ? [...sentences, remainder] : sentences
    this.consumed += sentences.join('').length
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
      try {
        while (this.isCurrentStream(generation, signal)) {
          const result = await reader.read()
          if (result.done || !this.isCurrentStream(generation, signal)) break
          pending += decoder.decode(result.value, { stream: true })
          const parsed = parseSseRecords(pending)
          pending = parsed.remainder
          for (const event of parsed.events) {
            if (!this.isCurrentStream(generation, signal)) return
            const pcm = pcmDeltaFromSse(event)
            if (pcm !== null) {
              await this.audio.enqueue(pcm)
              if (!this.isCurrentStream(generation, signal)) return
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (this.isCurrentStream(generation, signal)) throw error
    }
  }

  private handleStreamError(error: unknown): void {
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
    this.reportStatus()
  }

  private reportStatus(): void {
    if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, this.status)
  }
}
