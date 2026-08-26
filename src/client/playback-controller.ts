import { TTS_ROUTE } from '../shared.js'
import type { PlaybackStatus, PlaybackView } from './playback-types.js'

interface SynthesizedAudio {
  url: string
  audio: HTMLAudioElement
  onEnded: () => void
  onError: () => void
}

export class PlaybackController {
  readonly autoPlayArmedAt = Date.now()
  private view: PlaybackView = { sessionId: null, messageId: null, source: null, status: 'idle', error: null }
  private readonly listeners = new Set<() => void>()
  private readonly automaticallyPlayed = new Set<string>()
  private readonly liveSessions = new Set<string>()
  private readonly completedSessions = new Set<string>()
  private readonly completedMessages = new Map<string, string>()
  private current: SynthesizedAudio | null = null
  private request: AbortController | null = null
  private generation = 0
  private activeSessionId: string | null = null

  getSnapshot = (): PlaybackView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  activateSession(sessionId: string): void {
    if (this.activeSessionId === sessionId) return
    this.generation += 1
    this.stopCurrent()
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.activeSessionId = sessionId
    this.publish(this.emptyView())
  }

  cancelPlayback(sessionId: string): void {
    if (this.activeSessionId !== sessionId) return
    this.generation += 1
    this.stopCurrent()
    this.publish(this.emptyView())
  }

  deactivateSession(sessionId: string): void {
    if (this.activeSessionId !== sessionId) return
    this.generation += 1
    this.stopCurrent()
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.activeSessionId = null
    this.publish(this.emptyView())
  }

  observeSession(sessionId: string, running: boolean, latestMessageId: string | null): void {
    if (this.activeSessionId !== sessionId) return
    if (running) {
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
    if (this.automaticallyPlayed.has(key)) return false
    this.automaticallyPlayed.add(key)
    this.completedSessions.delete(sessionId)
    this.completedMessages.delete(sessionId)
    return true
  }

  updateLivePlayback(sessionId: string, messageId: string, status: PlaybackStatus): void {
    if (this.activeSessionId !== sessionId) return
    if (status === 'idle') {
      if (this.view.source === 'live' && this.view.messageId === messageId) this.publish(this.emptyView())
      return
    }
    if (this.view.source !== 'complete') this.publish({ sessionId, messageId, source: 'live', status, error: status === 'error' ? 'play-failed' : null })
  }

  async toggle(sessionId: string, messageId: string, text: string, automatic: boolean): Promise<void> {
    if (this.activeSessionId !== sessionId) return
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
    const generation = ++this.generation
    const controller = new AbortController()
    this.request = controller
    this.publish({ sessionId, messageId, source: 'complete', status: 'loading', error: null })

    try {
      const response = await fetch(TTS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
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
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
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
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.activeSessionId = null
    this.listeners.clear()
  }

  private stopCurrent(): void {
    this.request?.abort()
    this.request = null
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
