import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, supportsRealtimeTts, ttsSelection } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { LiveSpeechController, LocalSpeechController, PlaybackController } from '../playback/index.js'
import { RealtimeSpeechSession } from '../playback/realtime-speech-session.js'
import { useSettingsSnapshot } from '../settings/scope.js'
import { assistantText, finalAssistantMessageId, finalLiveMessage, latestAssistantMessageId } from './message-text.js'
import type { AutomaticReading } from './automatic-reading.js'
import { useApiKeySupported } from './api-key-status.js'
import { unrestrictedAudioFocus } from '../playback/tab-audio-focus.js'
import type { AudioFocus } from '../playback/tab-audio-focus.js'
import type { QuestionTitleCollector } from '../announcements/question-titles.js'

interface SessionPlaybackObserverProps {
  sessionId: string
  messageId?: string
  useSession: <T>(selector: (snapshot: SessionSnapshot) => T) => T
  useChat: <T>(selector: (snapshot: ChatSnapshot) => T) => T
  playback: PlaybackController
  live: LiveSpeechController
  local: LocalSpeechController
  settings: ConfigForm<TtsSettings>
  audioFocus?: AudioFocus
  automaticReading: AutomaticReading
  questions?: QuestionTitleCollector
}

/** Own the active-session boundary and feed its partial assistant output into realtime speech. */
export function SessionPlaybackObserver({ sessionId, useSession, useChat, playback, live, local, settings, questions, automaticReading, audioFocus = unrestrictedAudioFocus }: SessionPlaybackObserverProps): null {
  useEffect(() => questions?.activateSession(sessionId), [questions, sessionId])
  const ownsAudio = useSyncExternalStore(audioFocus.subscribe, audioFocus.canPlay, audioFocus.canPlay)
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const apiKeySupported = useApiKeySupported(ownsAudio && resolvedSettings.localSpeechMode !== 'disabled', resolvedSettings.provider)
  live.setMaxPausedPcmBytes(resolvedSettings.maxPausedPcmBytes)
  local.setVoiceURI(resolvedSettings.localVoiceURI)
  local.setTimeoutMs(resolvedSettings.requestTimeoutMs)

  const sessionSnapshot = useSession(snapshot => snapshot)
  const legacy = useChat(chat => chat.legacy)
  const runningSnapshot = sessionSnapshot.running
  const foldedReplies = useSyncExternalStore(automaticReading.subscribe, automaticReading.getSnapshot, automaticReading.getSnapshot)

  const [speech] = useState(() => new RealtimeSpeechSession(live, local))
  const selectionKey = JSON.stringify(ttsSelection(resolvedSettings))
  const previousSelection = useRef(selectionKey)
  const active = useRef<{ turn: number; step: number } | null>(null)
  const wasRunning = useRef(runningSnapshot)
  const runArmed = useRef(true)
  const finalMessageId = useChat(finalAssistantMessageId)
  const latestMessageId = foldedReplies === 'final' ? finalMessageId : latestAssistantMessageId(legacy)
  const partial = legacy.partial
  const partialText = partial === null ? '' : assistantText(partial.blocks)
  const attachedMidRun = useRef(runningSnapshot)
  const resumeCheckpoint = useRef(runningSnapshot ? partial : null)
  const awaitingOpen = useRef(runningSnapshot && sessionSnapshot.openState !== 'open')

  useEffect(() => {
    active.current = null
    wasRunning.current = runningSnapshot
    runArmed.current = true
    attachedMidRun.current = runningSnapshot
    resumeCheckpoint.current = runningSnapshot ? partial : null
    awaitingOpen.current = runningSnapshot && sessionSnapshot.openState !== 'open'
    playback.activateSession(sessionId)
    speech.activate(sessionId)
    return () => {
      active.current = null
      automaticReading.release(sessionId)
      speech.deactivate(sessionId)
      playback.deactivateSession(sessionId)
    }
  }, [automaticReading, playback, sessionId, speech])

  useEffect(() => {
    if (previousSelection.current !== selectionKey) {
      previousSelection.current = selectionKey
      const previousTurn = active.current?.turn
      speech.cancel()
      if (previousTurn !== undefined) { live.blockTurn(sessionId, previousTurn); local.blockTurn(sessionId, previousTurn) }
      live.configure(resolvedSettings)
      active.current = null
      if (runningSnapshot) runArmed.current = false
    }
    speech.configure({ localSpeechMode: resolvedSettings.localSpeechMode, apiKeySupported, readScope: resolvedSettings.readScope })
    const beganRun = runningSnapshot && !wasRunning.current
    wasRunning.current = runningSnapshot
    if (!runningSnapshot) runArmed.current = true
    else if (beganRun) {
      runArmed.current = true
      attachedMidRun.current = false
      resumeCheckpoint.current = null
      awaitingOpen.current = false
      speech.cancel()
      playback.cancelPlayback(sessionId)
      active.current = null
    }

    automaticReading.observe(sessionId, runningSnapshot)
    if (!automaticReading.allowed(sessionId)) runArmed.current = false
    const localModel = supportsRealtimeTts(resolvedSettings)
    const realtimeSpeechEnabled = localModel
    playback.observeSession(sessionId, ownsAudio && audioFocus.canPlay() && runningSnapshot && runArmed.current, latestMessageId, attachedMidRun.current)
    if (!ownsAudio || !audioFocus.canPlay() || !resolvedSettings.enabled || !resolvedSettings.autoPlay || !realtimeSpeechEnabled) {
      speech.cancel()
      active.current = null
      if (runningSnapshot) runArmed.current = false
      return
    }
    if (foldedReplies === 'final') {
      if (active.current !== null) speech.cancel()
      active.current = null
      return
    }
    if (!runArmed.current) return
    if (awaitingOpen.current) {
      if (sessionSnapshot.openState !== 'open') return
      resumeCheckpoint.current = partial
      awaitingOpen.current = false
    }
    if (partial !== null) {
      if (active.current !== null && (active.current.turn !== partial.turn || active.current.step !== partial.step)) {
        const previous = finalLiveMessage(legacy, active.current.turn, active.current.step)
        if (previous !== null) {
          speech.finish(sessionId, previous)
        }
      }
      active.current = { turn: partial.turn, step: partial.step }
      const prime = resumeCheckpoint.current !== null
        && resumeCheckpoint.current.turn === partial.turn && resumeCheckpoint.current.step === partial.step
      resumeCheckpoint.current = null
      automaticReading.markAutomatic()
      speech.observe(sessionId, partial.turn, partial.step, partialText, prime)
      return
    }
    if (active.current !== null) {
      const final = finalLiveMessage(legacy, active.current.turn, active.current.step)
      if (final !== null) {
        speech.finish(sessionId, final)
      } else if (!runningSnapshot) {
        speech.cancel()
      }
      active.current = null
    }
  }, [automaticReading, foldedReplies, audioFocus, ownsAudio, selectionKey, apiKeySupported, legacy, latestMessageId, live, local, partial, partialText, playback, resolvedSettings.autoPlay, resolvedSettings.enabled, resolvedSettings.localSpeechMode, resolvedSettings.model, resolvedSettings.provider, resolvedSettings.doubaoModel, resolvedSettings.doubaoVoice, resolvedSettings.doubaoClonedVoice, resolvedSettings.readScope, runningSnapshot, sessionId, sessionSnapshot.openState, speech])

  return null
}
