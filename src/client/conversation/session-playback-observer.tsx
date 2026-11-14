import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, ttsSelection } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { LiveSpeechController, LocalSpeechController, PlaybackController } from '../playback/index.js'
import { RealtimeSpeechSession } from '../playback/realtime-speech-session.js'
import { useSettingsSnapshot } from '../settings/scope.js'
import { assistantText, automaticAssistantMessageId, finalLiveMessage } from './message-text.js'
import { automaticReplyMode } from './automatic-reading.js'
import { latestTurn } from './turn-state.js'
import type { AutomaticReading } from './automatic-reading.js'
import { useApiKeySupported } from './api-key-status.js'
import { useEngineState } from '../use-engine-state.js'
import { engineCanRequest, engineSupportsRealtime, externalEngine } from '../engine-state.js'
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
  automaticAudioFocus?: AudioFocus
  automaticReading: AutomaticReading
  questions?: QuestionTitleCollector
}

/** Own the active-session boundary and feed its partial assistant output into realtime speech. */
export function SessionPlaybackObserver({ sessionId, useSession, useChat, playback, live, local, settings, questions, automaticReading, audioFocus = unrestrictedAudioFocus, automaticAudioFocus = audioFocus }: SessionPlaybackObserverProps): null {
  useEffect(() => questions?.activateSession(sessionId), [questions, sessionId])
  const ownsAudio = useSyncExternalStore(automaticAudioFocus.subscribe, automaticAudioFocus.canPlay, automaticAudioFocus.canPlay)
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = useMemo(() => resolveTtsSettings(settingsSnapshot.value), [settingsSnapshot.value])
  const engineView = useEngineState()
  const builtinKeySupported = useApiKeySupported(ownsAudio && !externalEngine() && resolvedSettings.localSpeechMode !== 'disabled', resolvedSettings.provider)
  const apiKeySupported = externalEngine() ? engineView.engine?.ready ?? false : builtinKeySupported
  live.setMaxPausedPcmBytes(resolvedSettings.maxPausedPcmBytes)
  local.setVoiceURI(resolvedSettings.localVoiceURI)
  local.setMossVoice(resolvedSettings.localVoiceEngine, resolvedSettings.mossBaseURL, resolvedSettings.mossVoice)
  local.setTimeoutMs(resolvedSettings.requestTimeoutMs)

  const runningSnapshot = useSession(snapshot => snapshot.running)
  const openState = useSession(snapshot => snapshot.openState)
  const legacy = useChat(chat => chat.legacy)
  const foldedReplies = useSyncExternalStore(automaticReading.subscribe, automaticReading.getSnapshot, automaticReading.getSnapshot)
  const replyMode = automaticReplyMode(foldedReplies, resolvedSettings.readScope)
  const concise = resolvedSettings.readScope === 'concise'

  const [speech] = useState(() => new RealtimeSpeechSession(live, local))
  const selectionKey = useMemo(() => JSON.stringify([ttsSelection(resolvedSettings), engineView, concise]), [resolvedSettings, engineView, concise])
  const previousSelection = useRef(selectionKey)
  const active = useRef<{ turn: number; step: number } | null>(null)
  const wasRunning = useRef(runningSnapshot)
  const runArmed = useRef(true)
  const latestMessageId = useChat(chat => automaticAssistantMessageId(chat, replyMode))
  const turn = useChat(chat => latestTurn(chat))
  const partial = legacy.partial
  const partialText = replyMode === 'final' || partial === null ? '' : assistantText(partial.blocks)
  const attachedMidRun = useRef(runningSnapshot)
  const resumeCheckpoint = useRef(runningSnapshot ? partial : null)
  const awaitingOpen = useRef(runningSnapshot && openState !== 'open')

  useEffect(() => {
    active.current = null
    wasRunning.current = runningSnapshot
    runArmed.current = true
    attachedMidRun.current = runningSnapshot
    resumeCheckpoint.current = runningSnapshot ? partial : null
    awaitingOpen.current = runningSnapshot && openState !== 'open'
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
    live.configure(resolvedSettings)
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
    const realtimeSpeechEnabled = engineCanRequest() && engineSupportsRealtime(resolvedSettings)
    playback.observeSession(sessionId, ownsAudio && automaticAudioFocus.canPlay() && runningSnapshot && runArmed.current, latestMessageId, attachedMidRun.current)
    if (!runningSnapshot && turn?.end && turn.end.data.reason.kind !== 'completed') {
      automaticReading.stopAutomatic(() => speech.cancel())
      active.current = null
      runArmed.current = false
      return
    }
    if (!ownsAudio || !automaticAudioFocus.canPlay() || !resolvedSettings.enabled || !resolvedSettings.autoPlay || (!concise && !realtimeSpeechEnabled)) {
      if (!audioFocus.canPlay() || !resolvedSettings.enabled || automaticReading.isAutomatic()) speech.cancel()
      active.current = null
      if (runningSnapshot) runArmed.current = false
      return
    }
    if (replyMode === 'final') {
      if (active.current !== null) speech.cancel()
      active.current = null
      return
    }
    if (!runArmed.current) return
    if (awaitingOpen.current) {
      if (openState !== 'open') return
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
        active.current = null
      } else if (!runningSnapshot) {
        speech.cancel()
        active.current = null
      }
      // Keep the cursor across a gap between the partial and durable message snapshots.
    }
  }, [automaticReading, replyMode, concise, audioFocus, automaticAudioFocus, ownsAudio, selectionKey, apiKeySupported, legacy, latestMessageId, live, local, partial, partialText, playback, resolvedSettings.autoPlay, resolvedSettings.enabled, resolvedSettings.localSpeechMode, resolvedSettings.localVoiceEngine, resolvedSettings.mossBaseURL, resolvedSettings.mossVoice, resolvedSettings.model, resolvedSettings.provider, resolvedSettings.doubaoModel, resolvedSettings.doubaoVoice, resolvedSettings.doubaoClonedVoice, resolvedSettings.readScope, runningSnapshot, sessionId, openState, speech, turn])

  return null
}
