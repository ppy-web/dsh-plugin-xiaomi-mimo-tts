import type { ReactElement } from 'react'
import { useEffect, useSyncExternalStore } from 'react'
import {
  Button,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { RiVoiceAiFill } from 'react-icons/ri'
import { resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Translate } from '../localization.js'
import type { LiveSpeechController, LocalSpeechController, PlaybackController } from '../playback/index.js'
import { useSettingsSnapshot } from '../settings/scope.js'
import { AnimatedAudioLines } from './animated-audio-lines.js'
import { automaticAssistantMessageId, messageText, messageTime, messageLiveIdentity } from './message-text.js'
import { automaticReplyMode } from './automatic-reading.js'
import { useApiKeySupported } from './api-key-status.js'
import { useEngineState } from '../use-engine-state.js'
import { engineCanRequest } from '../engine-state.js'
import { handleReadAloudClick, playCompletedReply } from '../playback/read-aloud-playback.js'
import { unrestrictedAudioFocus } from '../playback/tab-audio-focus.js'
import type { AutomaticReading } from './automatic-reading.js'
import type { AudioFocus } from '../playback/tab-audio-focus.js'

const PLAYBACK_ERROR_KEYS: Record<string, Parameters<Translate>[0]> = {
  'api-key-rejected': 'error.apiKeyRejected',
  'voice-unavailable': 'error.voiceUnavailable',
  'voice-required': 'error.voiceUnavailable',
  'resource-unavailable': 'error.resourceUnavailable',
  'rate-limited': 'error.rateLimited',
  'tts-timeout': 'error.timeout',
  'pcm-pause-buffer-limit': 'error.bufferLimit',
  'stream-buffer-limit': 'error.bufferLimit',
  'no-text': 'error.noText',
  'local-speech-not-allowed': 'error.localNotAllowed',
  'local-voice-unavailable': 'error.localVoiceUnavailable',
  'local-speech-timeout': 'error.localTimeout',
  'local-speech-audio-device': 'error.localAudioDevice',
  'local-speech-failed': 'error.localSynthesis',
  'local-speech-unavailable': 'error.localSynthesis',
  'moss-unreachable': 'error.localMossUnreachable',
  'moss-voice-required': 'error.localMossVoiceMissing',
  'moss-invalid-url': 'error.localMossInvalidUrl',
  'moss-timeout': 'error.localMossTimeout',
  'moss-api-error': 'error.localMossFailed',
  'moss-audio-failed': 'error.localMossFailed',
  'moss-request-failed': 'error.localMossFailed',
  'moss-invalid-response': 'error.localMossFailed',
  'moss-response-too-large': 'error.localMossFailed',
  'moss-audio-too-large': 'error.localMossFailed',
  'autoplay-blocked': 'error.play',
  'play-failed': 'error.play',
}

interface ReadAloudActionProps {
  sessionId: string
  messageId: string
  useSession: <T>(selector: (snapshot: SessionSnapshot) => T) => T
  useChat: <T>(selector: (snapshot: ChatSnapshot) => T) => T
  playback: PlaybackController
  live: LiveSpeechController
  local: LocalSpeechController
  settings: ConfigForm<TtsSettings>
  t: Translate
  automaticReading: AutomaticReading
  audioFocus?: AudioFocus
  automaticAudioFocus?: AudioFocus
}

export function ReadAloudAction({ sessionId, messageId, useSession, useChat, playback, live, local, settings, t, automaticReading, audioFocus = unrestrictedAudioFocus, automaticAudioFocus = audioFocus }: ReadAloudActionProps): ReactElement | null {
  const ownsAudio = useSyncExternalStore(automaticAudioFocus.subscribe, automaticAudioFocus.canPlay, automaticAudioFocus.canPlay)
  const sessionSnapshot = useSession(snapshot => snapshot)
  const legacy = useChat(chat => chat.legacy)
  const foldedReplies = useSyncExternalStore(automaticReading.subscribe, automaticReading.getSnapshot, automaticReading.getSnapshot)
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const replyMode = automaticReplyMode(foldedReplies, resolvedSettings.readScope)
  const latestMessageId = useChat(chat => automaticAssistantMessageId(chat, replyMode))
  const running = sessionSnapshot.running
  const message = {
    text: messageText(legacy, messageId),
    time: messageTime(legacy, messageId),
    identity: messageLiveIdentity(legacy, messageId),
  }
  const text = message.text
  const engineView = useEngineState()
  const apiKeySupported = useApiKeySupported(ownsAudio && resolvedSettings.localSpeechMode !== 'disabled', resolvedSettings.provider)
  local.setVoiceURI(resolvedSettings.localVoiceURI)
  local.setMossVoice(resolvedSettings.localVoiceEngine, resolvedSettings.mossBaseURL, resolvedSettings.mossVoice)
  local.setTimeoutMs(resolvedSettings.requestTimeoutMs)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)

  const request = {
    sessionId, messageId, text, playback, live, local,
    turn: legacy.partial?.turn ?? message.identity?.turn,
    settings: resolvedSettings, apiKeySupported,
  }

  useEffect(() => {
    if (!engineCanRequest() || !automaticReading.allowed(sessionId) || !ownsAudio || !automaticAudioFocus.canPlay() || text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || (live.hasHandled(sessionId, message.identity) || local.hasHandled(sessionId, message.identity)) || running || latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return
    const cancel = window.setTimeout(() => {
      if (!automaticAudioFocus.canPlay() || live.hasHandled(sessionId, message.identity) || local.hasHandled(sessionId, message.identity) || !automaticReading.allowed(sessionId) || !playback.claimAutomaticPlayback(sessionId, messageId)) return
      if (playCompletedReply(request, true)) automaticReading.markAutomatic()
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [engineView, automaticReading, latestMessageId, automaticAudioFocus, ownsAudio, apiKeySupported, live, local, message.identity, message.time, messageId, playback, resolvedSettings.localSpeechMode, resolvedSettings.localVoiceEngine, resolvedSettings.mossBaseURL, resolvedSettings.mossVoice, resolvedSettings.model, resolvedSettings.provider, resolvedSettings.doubaoModel, resolvedSettings.doubaoVoice, resolvedSettings.doubaoClonedVoice, resolvedSettings.breezeVoice, resolvedSettings.breezeInstruction, resolvedSettings.readScope, resolvedSettings.voiceRate, running, sessionId, settingsSnapshot.value?.autoPlay, settingsSnapshot.value?.enabled, text])

  if (settingsSnapshot.value?.enabled !== true || text.length === 0) return null

  const mine = view.sessionId === sessionId && view.messageId === messageId
  const status = mine ? view.status : 'idle'
  const source = mine ? view.source : null
  const liveActive = (source === 'live' || source === 'system') && (status === 'loading' || status === 'playing')
  const label = status === 'loading'
    ? source === 'complete' ? t('action.loading') : t('action.cancel')
    : status === 'playing'
      ? t('action.pause')
      : status === 'paused'
        ? t('action.resume')
        : status === 'error'
          ? t('action.retry')
          : t('action.play')
  const error = mine ? view.error : null
  const errorText = error === null ? null : t(PLAYBACK_ERROR_KEYS[error] ?? 'error.request')
  const statusText = errorText ?? (source === 'system' && (status === 'loading' || status === 'playing' || status === 'paused') ? t('action.localFallback') : null)
  const tooltipLabel = statusText === null ? label : `${label} · ${statusText}`

  return (
    <Tooltip label={tooltipLabel} side="bottom" portal>
      <Button
        type="button"
        variant="toolbar"
        size="sm"
        className={errorText === null ? 'xmimo-tts-action' : 'xmimo-tts-action xmimo-tts-failed'}
        aria-label={label}
        aria-description={statusText ?? undefined}
        aria-pressed={status === 'playing' || liveActive}
        disabled={status === 'loading' && source === 'complete'}
        onClick={() => { audioFocus.claim(); if (audioFocus.canPlay()) { automaticReading.markManual(); handleReadAloudClick(request, view) } }}
      >
        {status === 'playing'
          ? <AnimatedAudioLines size={16} />
          : <RiVoiceAiFill className={status === 'loading' ? 'xmimo-tts-pulse' : undefined} size={16} />}
      </Button>
    </Tooltip>
  )
}
