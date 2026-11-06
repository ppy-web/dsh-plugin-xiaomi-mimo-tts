import { normalizeVoiceRate, prepareProviderTtsText, splitBreezeTtsSegments, splitTtsSegments, TTS_ROUTE } from '../../shared.js'
import { hostRoute } from '../host-route.js'
import type { PlaybackStatus, PlaybackView } from './types.js'
import { applyMediaVoiceRate } from './voice-rate.js'
import { playSegmentAudio, prefetchSegmentAudio } from './segmented-audio.js'
import type { AudioHistory } from '../history/audio-history.js'
import { ttsSelection } from '../../types/providers.js'
import type { TtsSelection } from '../../types/providers.js'
import type { ResolvedTtsSettings } from '../../types/settings.js'
import { externalEngine, speechRequestBody, splitExternalText } from '../engine-state.js'

interface SynthesizedAudio {
  url: string
  audio: HTMLAudioElement
  onEnded: () => void
  onError: () => void
}

export class PlaybackController {
  constructor(private readonly history?: AudioHistory) {}
  autoPlayArmedAt = Date.now()
  private view: PlaybackView = { sessionId: null, messageId: null, source: null, status: 'idle', error: null }
  private readonly listeners = new Set<() => void>()
  private readonly automaticallyPlayed = new Set<string>()
  private readonly liveSessions = new Set<string>()
  private readonly completedSessions = new Set<string>()
  private readonly completedMessages = new Map<string, string>()
  private readonly attachedMidRun = new Set<string>()
  private current: SynthesizedAudio | null = null
  private readonly segmentQueue = new Set<HTMLAudioElement>()
  private segmentedState: { sessionId: string; messageId: string; segments: string[]; index: number; voiceRate: number } | null = null
  private request: AbortController | null = null
  private generation = 0
  private activeSessionId: string | null = null
  private beforePlayback: (() => void) | null = null
  private volume = 1
  private voiceRate = 1
  private selection: TtsSelection | undefined

  configure(settings: ResolvedTtsSettings): void {
    this.selection = ttsSelection(settings)
    this.voiceRate = normalizeVoiceRate(settings.voiceRate)
  }

  getSnapshot = (): PlaybackView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setBeforePlayback(handler: (() => void) | null): void { this.beforePlayback = handler }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
    if (this.current !== null) this.current.audio.volume = this.volume
    for (const audio of this.segmentQueue) audio.volume = this.volume
  }

  setVoiceRate(value: number): void {
    this.voiceRate = normalizeVoiceRate(value)
    if (this.selection?.provider === 'doubao' || this.selection?.provider === 'breeze') this.selection = { ...this.selection, voiceRate: this.voiceRate }
  }

  interrupt(): void {
    this.generation += 1
    this.stopCurrent()
    this.segmentedState = null
    this.publish(this.emptyView())
  }

  activateSession(sessionId: string): void {
    if (this.activeSessionId === sessionId) return
    this.generation += 1
    this.stopCurrent()
    this.segmentedState = null
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.attachedMidRun.clear()
    this.activeSessionId = sessionId
    this.publish(this.emptyView())
  }

  cancelPlayback(sessionId: string): void {
    if (this.activeSessionId !== sessionId) return
    this.segmentedState = null
    this.generation += 1
    this.stopCurrent()
    this.publish(this.emptyView())
  }

  deactivateSession(sessionId: string): void {
    if (this.activeSessionId !== sessionId) return
    this.generation += 1
    this.stopCurrent()
    this.segmentedState = null
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.attachedMidRun.clear()
    this.activeSessionId = null
    this.publish(this.emptyView())
  }

  observeSession(sessionId: string, running: boolean, latestMessageId: string | null, attachedMidRun = false): void {
    if (this.activeSessionId !== sessionId) return
    if (running) {
      if (attachedMidRun) this.attachedMidRun.add(sessionId)
      else this.attachedMidRun.delete(sessionId)
      this.liveSessions.add(sessionId)
      this.completedSessions.delete(sessionId)
      this.completedMessages.delete(sessionId)
      return
    }

    if (this.liveSessions.delete(sessionId)) {
      this.completedSessions.add(sessionId)
    }
    if (this.completedSessions.has(sessionId) && latestMessageId !== null) {
      this.completedMessages.set(sessionId, latestMessageId)
    }
  }

  claimAutomaticPlayback(sessionId: string, messageId: string): boolean {
    if (this.activeSessionId !== sessionId) return false
    const key = `${sessionId}:${messageId}`
    if (this.completedMessages.get(sessionId) !== messageId) return false
    if (this.attachedMidRun.has(sessionId)) return false
    if (this.automaticallyPlayed.has(key)) return false
    this.automaticallyPlayed.add(key)
    this.completedSessions.delete(sessionId)
    this.completedMessages.delete(sessionId)
    return true
  }

  updateLivePlayback(sessionId: string, messageId: string, status: PlaybackStatus, source: 'live' | 'system' = 'live', error: string | null = null): void {
    if (this.activeSessionId !== sessionId) return
    if (status === 'idle') {
      if (this.view.source === source && this.view.messageId === messageId) this.publish(this.emptyView())
      return
    }
    if (this.view.source !== 'complete') this.publish({ sessionId, messageId, source, status, error: status === 'error' ? (error ?? 'play-failed') : null })
  }

  resetAutomaticPlayback(): void {
    this.autoPlayArmedAt = Date.now()
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.attachedMidRun.clear()
  }

  pauseSegmented(sessionId: string, messageId: string): void {
    if (this.activeSessionId !== sessionId || this.view.source !== 'segmented' || this.view.messageId !== messageId) return
    this.generation += 1
    this.stopCurrent()
    this.publish({ sessionId, messageId, source: 'segmented', status: 'paused', error: null })
  }

  async segmented(sessionId: string, messageId: string, text: string, automatic: boolean, fallback?: () => void): Promise<void> {
    if (this.activeSessionId !== sessionId) return
    this.beforePlayback?.()
    const previous = this.segmentedState
    const resume = previous !== null && previous.sessionId === sessionId && previous.messageId === messageId
    this.stopCurrent()
    const segments = resume ? previous.segments : (externalEngine() ? splitExternalText(text) : this.selection?.provider === 'breeze' ? splitBreezeTtsSegments(text) : splitTtsSegments(text, undefined, undefined, value => prepareProviderTtsText(value, this.selection ?? {})))
    const startIndex = resume ? previous.index : 0
    const voiceRate = resume ? previous.voiceRate : this.voiceRate
    if (segments.length === 0) {
      this.publish({ sessionId, messageId, source: 'segmented', status: 'error', error: 'no-text' })
      return
    }
    const state = { sessionId, messageId, segments, index: startIndex, voiceRate }
    this.segmentedState = state
    const generation = ++this.generation
    const controller = new AbortController()
    this.request = controller
    let audioStarted = false
    this.publish({ sessionId, messageId, source: 'segmented', status: 'loading', error: null })
    try {
      let nextAudio = prefetchSegmentAudio(segments[startIndex]!, controller.signal)
      for (let index = startIndex; index < segments.length; index += 1) {
        state.index = index
        const result = await nextAudio
        if (generation !== this.generation || this.activeSessionId !== sessionId) return
        if (!result.ok) throw result.error
        const blob = result.blob
        void this.history?.add({ blob, text: segments[index]!, format: 'wav', source: 'conversation', sessionId, messageId })
        if (index + 1 < segments.length) nextAudio = prefetchSegmentAudio(segments[index + 1]!, controller.signal)
        await playSegmentAudio(blob, {
          signal: controller.signal, volume: this.volume, voiceRate, automatic,
          onCreated: audio => { this.segmentQueue.add(audio) },
          onReleased: audio => { this.segmentQueue.delete(audio) },
          onStarted: () => {
            if (generation !== this.generation || this.activeSessionId !== sessionId) return
            audioStarted = true
            this.publish({ sessionId, messageId, source: 'segmented', status: 'playing', error: null })
          },
        })
        if (generation !== this.generation || this.activeSessionId !== sessionId) return
        state.index = index + 1
      }
      if (generation === this.generation && this.activeSessionId === sessionId) {
        this.segmentedState = null
        this.publish(this.emptyView())
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation && this.activeSessionId === sessionId) {
        controller.abort()
        if (!audioStarted && fallback !== undefined) {
          this.segmentedState = null
          this.publish(this.emptyView())
          fallback()
          return
        }
        this.publish({ sessionId, messageId, source: 'segmented', status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      if (generation === this.generation) this.request = null
    }
  }

  async toggle(sessionId: string, messageId: string, text: string, automatic: boolean, fallback?: () => void, format: 'mp3' | 'wav' = 'mp3'): Promise<void> {
    if (this.activeSessionId !== sessionId) return
    this.beforePlayback?.()
    if (this.view.source === 'complete' && this.view.sessionId === sessionId && this.view.messageId === messageId && this.current !== null) {
      const audio = this.current.audio
      const generation = this.generation
      if (audio.paused) {
        try {
          await audio.play()
          if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return
          this.publish({ sessionId, messageId, source: 'complete', status: 'playing', error: null })
        } catch {
          if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return
          this.publish({ sessionId, messageId, source: 'complete', status: 'paused', error: automatic ? 'autoplay-blocked' : 'play-failed' })
        }
      } else {
        audio.pause()
        this.publish({ sessionId, messageId, source: 'complete', status: 'paused', error: null })
      }
      return
    }

    if (text.length === 0) {
      this.publish({ sessionId, messageId, source: 'complete', status: 'error', error: 'no-text' })
      return
    }

    this.stopCurrent()
    const selection = this.selection
    const voiceRateApplied = !externalEngine() && (selection?.provider === 'doubao' || selection?.provider === 'breeze')
    const voiceRate = voiceRateApplied ? 1 : this.voiceRate
    const generation = ++this.generation
    const controller = new AbortController()
    this.request = controller
    let audioCreated = false
    this.publish({ sessionId, messageId, source: 'complete', status: 'loading', error: null })

    try {
      const response = await fetch(hostRoute(TTS_ROUTE), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(speechRequestBody({ ...selection, text, format })),
        signal: controller.signal,
      })
      if (!response.ok) {
        let message = `${response.status}`
        try {
          const body = await response.json() as { message?: unknown; error?: unknown }
          if (typeof body.message === 'string') message = body.message
          else if (typeof body.error === 'string') message = body.error
        } catch {
          // Non-JSON error bodies leave the HTTP status as the fallback message.
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      if (generation !== this.generation || this.activeSessionId !== sessionId) return
      const actualFormat = response.headers.get('content-type')?.includes('wav') ? 'wav' : format
      void this.history?.add({ blob, text, format: actualFormat, source: 'conversation', sessionId, messageId, voiceRateApplied })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.volume = this.volume
      applyMediaVoiceRate(audio, voiceRate)
      audioCreated = true
      const current: SynthesizedAudio = {
        url,
        audio,
        onEnded: () => {
          if (this.activeSessionId !== sessionId || this.current?.audio !== audio) return
          this.releaseCurrentAudio(audio)
          this.publish(this.emptyView())
        },
        onError: () => {
          if (this.activeSessionId !== sessionId || this.current?.audio !== audio) return
          this.releaseCurrentAudio(audio)
          this.publish({ sessionId, messageId, source: 'complete', status: 'error', error: 'play-failed' })
        },
      }
      this.current = current
      this.request = null
      audio.addEventListener('ended', current.onEnded)
      audio.addEventListener('error', current.onError)

      try {
        await audio.play()
        if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return
        this.publish({ sessionId, messageId, source: 'complete', status: 'playing', error: null })
      } catch {
        if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return
        this.publish({ sessionId, messageId, source: 'complete', status: 'paused', error: automatic ? 'autoplay-blocked' : 'play-failed' })
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation || this.activeSessionId !== sessionId) return
      if (!audioCreated && fallback !== undefined) {
        this.request = null
        this.publish(this.emptyView())
        fallback()
        return
      }
      this.request = null
      this.publish({
        sessionId,
        messageId,
        source: 'complete',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  dispose(): void {
    this.generation += 1
    this.stopCurrent()
    this.segmentedState = null
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.activeSessionId = null
    this.listeners.clear()
  }

  private stopCurrent(): void {
    this.request?.abort()
    this.request = null
    this.segmentQueue.clear()
    if (this.current !== null) this.releaseCurrentAudio(this.current.audio)
  }

  private releaseCurrentAudio(audio: HTMLAudioElement): void {
    if (this.current?.audio !== audio) return
    const current = this.current
    this.current = null
    audio.removeEventListener('ended', current.onEnded)
    audio.removeEventListener('error', current.onError)
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(current.url)
  }

  private emptyView(): PlaybackView {
    return { sessionId: null, messageId: null, source: null, status: 'idle', error: null }
  }

  private publish(view: PlaybackView): void {
    if (this.view.sessionId === view.sessionId
      && this.view.messageId === view.messageId
      && this.view.source === view.source
      && this.view.status === view.status
      && this.view.error === view.error) return
    this.view = view
    for (const listener of this.listeners) listener()
  }
}
