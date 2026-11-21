import { prepareProviderTtsText, stripXiaomiAudioTags, splitTtsSegments, stripBreezeAudioTags } from '../shared.js'
import { applyBreezeNonConcisePlaybackScope, applyNonConciseTtsPlaybackScope } from '../../text/scope-light.js'
import { getLoadedConciseText, loadConciseText } from './concise-loader.js'
import type { ResolvedTtsSettings } from '../shared.js'
import type { LiveSpeechController } from './live-speech-controller.js'
import type { LocalSpeechController } from './local-speech-controller.js'
import type { PlaybackController } from './playback-controller.js'
import type { PlaybackView } from './types.js'
import { engineSupportsRealtime, externalEngine, externalText, externalFallbackText } from '../engine-state.js'

export interface ReadAloudRequest {
  sessionId: string
  messageId: string
  text: string
  turn: number | undefined
  settings: ResolvedTtsSettings
  apiKeySupported: boolean | null
  playback: PlaybackController
  live: LiveSpeechController
  local: LocalSpeechController
  canStart?: () => boolean
}

function nonConciseReadAloudText(text: string, settings: ResolvedTtsSettings, automatic: boolean): string {
  const scope = settings.readScope === 'concise' ? 'smart' : settings.readScope
  return externalEngine() ? applyNonConciseTtsPlaybackScope(text, scope, automatic, undefined, externalText) : settings.provider === 'breeze'
    ? applyBreezeNonConcisePlaybackScope(text, scope, automatic)
    : applyNonConciseTtsPlaybackScope(text, scope, automatic, undefined, value => prepareProviderTtsText(value, settings, true))
}

/** Browser speech cannot synthesize provider audio tags, so strip them instead of reading tag words aloud. */
function fallbackText(text: string, settings: ResolvedTtsSettings): string {
  return externalEngine() ? externalFallbackText(text) : settings.provider === 'breeze' ? stripBreezeAudioTags(text) : settings.provider === 'xiaomi' ? stripXiaomiAudioTags(text, true) : text
}

function startCompletedReply(request: ReadAloudRequest, automatic: boolean, scopedText: string): boolean {
  const { sessionId, messageId, settings, apiKeySupported, playback, live, local } = request
  if (settings.readScope === 'concise' && scopedText === '') {
    if (!automatic) void playback.toggle(sessionId, messageId, '', false)
    return false
  }
  live.configure(settings)
  playback.configure(settings)
  const localText = fallbackText(scopedText, settings)
  const localFallback = settings.localSpeechMode === 'auto' ? () => local.playCompleted(sessionId, messageId, localText) : undefined
  const playRemote = (): void => {
    local.cancelSession(sessionId)
    if (!engineSupportsRealtime(settings)) {
      live.cancelSession(sessionId)
      if (externalEngine() || splitTtsSegments(scopedText).length > 1) void playback.segmented(sessionId, messageId, scopedText, automatic, localFallback)
      else void playback.toggle(sessionId, messageId, scopedText, automatic, localFallback, 'mp3')
    } else {
      playback.cancelPlayback(sessionId)
      live.playCompleted(sessionId, messageId, scopedText, settings.provider === 'deepseek' && !externalEngine() ? localFallback : () => {
        if (localFallback !== undefined) localFallback()
        else void playback.toggle(sessionId, messageId, scopedText, automatic, undefined, 'mp3')
      })
    }
  }
  if (settings.localSpeechMode === 'local-first' || (settings.localSpeechMode === 'auto' && apiKeySupported === false)) {
    live.cancelSession(sessionId)
    playback.cancelPlayback(sessionId)
    local.playCompleted(sessionId, messageId, localText, settings.localSpeechMode === 'local-first' ? playRemote : undefined)
  } else playRemote()
  return true
}

function withScopedText<T>(request: ReadAloudRequest, automatic: boolean, run: (scopedText: string) => T): T | undefined {
  const { sessionId, text, settings, playback, canStart } = request
  const isCurrent = playback.beginReplyPreparation(sessionId)
  const start = (module: ReturnType<typeof getLoadedConciseText>): T | undefined => {
    if (!isCurrent() || canStart?.() === false) return
    return run(module ? module.prepareConciseTtsText(text) : nonConciseReadAloudText(text, settings, automatic))
  }
  if (settings.readScope !== 'concise') return start(null)
  const loaded = getLoadedConciseText()
  if (loaded !== null) return start(loaded)
  void loadConciseText().then(start)
}

/** Start a completed reply with one directed fallback, using the selected playback range. */
export function playCompletedReply(request: ReadAloudRequest, automatic: boolean, onStarted?: () => void): boolean {
  return withScopedText(request, automatic, scopedText => {
    const started = startCompletedReply(request, automatic, scopedText)
    if (started) onStarted?.()
    return started
  }) ?? false
}

/** Keep button state transitions independent from React rendering. */
export function handleReadAloudClick(request: ReadAloudRequest, view: PlaybackView): void {
  const { sessionId, messageId, turn, settings, playback, live, local } = request
  const mine = view.sessionId === sessionId && view.messageId === messageId
  if (mine && (view.source === 'live' || view.source === 'system')) {
    const controller = view.source === 'system' ? local : live
    if (view.status === 'loading') {
      playback.cancelReplyPreparation()
      if (controller.stop(sessionId) && turn !== undefined) {
        live.blockTurn(sessionId, turn)
        local.blockTurn(sessionId, turn)
      }
      playback.cancelPlayback(sessionId)
      return
    }
    playback.cancelReplyPreparation()
    if (view.status === 'playing') { void controller.pause(sessionId); return }
    if (view.status === 'paused') { void controller.resume(sessionId); return }
  }
  if (mine && view.source === 'complete') {
    if (view.status === 'error' && settings.readScope === 'concise') playCompletedReply(request, false)
    else withScopedText(request, false, scopedText => { void playback.toggle(sessionId, messageId, scopedText, false) })
    return
  }
  if (mine && view.source === 'segmented') {
    if (view.status === 'playing' || view.status === 'loading') {
      playback.cancelReplyPreparation()
      playback.pauseSegmented(sessionId, messageId)
    } else {
      withScopedText(request, false, scopedText => {
        const localText = fallbackText(scopedText, settings)
        void playback.segmented(sessionId, messageId, scopedText, false, settings.localSpeechMode === 'auto'
          ? () => local.playCompleted(sessionId, messageId, localText)
          : undefined)
      })
    }
    return
  }
  playCompletedReply(request, false)
}
