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
import { finalAssistantMessageId, messageText, messageTime, latestAssistantMessageId, messageLiveIdentity } from './message-text.js'
import { useApiKeySupported } from './api-key-status.js'
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
}

export function ReadAloudAction({ sessionId, messageId, useSession, useChat, playback, live, local, settings, t, automaticReading, audioFocus = unrestrictedAudioFocus }: ReadAloudActionProps): ReactElement | null {
  const ownsAudio = useSyncExternalStore(audioFocus.subscribe, audioFocus.canPlay, audioFocus.canPlay)
  const sessionSnapshot = useSession(snapshot => snapshot)
  const legacy = useChat(chat => chat.legacy)
  const foldedReplies = useSyncExternalStore(automaticReading.subscribe, automaticReading.getSnapshot, automaticReading.getSnapshot)
  const finalMessageId = useChat(finalAssistantMessageId)
  const running = sessionSnapshot.running
  const message = {
    text: messageText(legacy, messageId),
    time: messageTime(legacy, messageId),
    latestMessageId: foldedReplies === 'final' ? finalMessageId : latestAssistantMessageId(legacy),
    identity: messageLiveIdentity(legacy, messageId),
  }
  const text = message.text
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const apiKeySupported = useApiKeySupported(ownsAudio && resolvedSettings.localSpeechMode !== 'disabled', resolvedSettings.provider, settingsSnapshot.revision)
  local.setVoiceURI(resolvedSettings.localVoiceURI)
  local.setTimeoutMs(resolvedSettings.requestTimeoutMs)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)

  const request = {
    sessionId, messageId, text, playback, live, local,
    turn: legacy.partial?.turn ?? message.identity?.turn,
    settings: resolvedSettings, apiKeySupported,
  }

  useEffect(() => {
    if (!automaticReading.allowed(sessionId) || (foldedReplies === 'final' && finalMessageId !== messageId) || !ownsAudio || !audioFocus.canPlay() || text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || (live.hasHandled(sessionId, message.identity) || local.hasHandled(sessionId, message.identity)) || running || message.latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return
    const cancel = window.setTimeout(() => {
      if (audioFocus.canPlay() && !live.hasHandled(sessionId, message.identity) && !local.hasHandled(sessionId, message.identity) && automaticReading.allowed(sessionId) && playback.claimAutomaticPlayback(sessionId, messageId)) { automaticReading.markAutomatic(); playCompletedReply(request, true) }
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [automaticReading, foldedReplies, finalMessageId, audioFocus, ownsAudio, apiKeySupported, live, local, message.identity, message.latestMessageId, message.time, messageId, playback, resolvedSettings.localSpeechMode, resolvedSettings.model, resolvedSettings.provider, resolvedSettings.doubaoModel, resolvedSettings.doubaoVoice, resolvedSettings.doubaoClonedVoice, resolvedSettings.readScope, running, sessionId, settingsSnapshot.value?.autoPlay, settingsSnapshot.value?.enabled, text])

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

  return (
    <>
      <Tooltip label={label} side="bottom">
        <Button
          type="button"
          variant="toolbar"
          size="sm"
          className="xmimo-tts-action"
          aria-label={label}
          aria-pressed={status === 'playing' || liveActive}
          disabled={status === 'loading' && source === 'complete'}
          onClick={() => { audioFocus.claim(); if (audioFocus.canPlay()) { automaticReading.markManual(); handleReadAloudClick(request, view) } }}
        >
          {status === 'playing'
            ? <AnimatedAudioLines size={16} />
            : <RiVoiceAiFill className={status === 'loading' ? 'xmimo-tts-pulse' : undefined} size={16} />}
        </Button>
      </Tooltip>
      {source === 'system' && (status === 'loading' || status === 'playing' || status === 'paused') ? <span className="xmimo-tts-local-fallback-status" role="status">{t('action.localFallback')}</span> : null}
      {errorText === null ? null : <span className="xmimo-tts-inline-error" role="status">{errorText}</span>}
    </>
  )
}
