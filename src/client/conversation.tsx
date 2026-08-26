import type { ReactElement } from 'react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  IconLoadingOutline16,
  IconPauseOutline16,
  IconPlayOutline16,
  Tooltip,
  extractMarkdownPlainText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationSnapshot, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { prepareTtsText, resolveTtsSettings } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import type { Translate } from './localization.js'
import { LiveSpeechController, PlaybackController } from './playback.js'
import type { LiveMessageIdentity } from './playback.js'
import { useSettingsSnapshot } from './settings-scope.js'

function messageText(snapshot: ConversationSnapshot, messageId: string): string {
  for (const node of snapshot.nodes) {
    if (node.kind !== 'assistant' || node.messageId !== messageId) continue
    const markdown = node.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('\n\n')
    return extractMarkdownPlainText(prepareTtsText(markdown)).trim()
  }
  return ''
}

function messageTime(snapshot: ConversationSnapshot, messageId: string): number | null {
  for (const node of snapshot.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return node.time
  }
  return null
}

function latestAssistantMessageId(snapshot: ConversationSnapshot): string | null {
  for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
    const node = snapshot.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined) return node.messageId
  }
  return null
}

function assistantText(blocks: readonly { kind: string; text?: string }[]): string {
  return blocks
    .filter((block): block is { kind: 'text'; text: string } => block.kind === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n\n')
}


function finalLiveMessage(snapshot: ConversationSnapshot, turn: number, step: number): LiveMessageIdentity | null {
  for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
    const node = snapshot.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined && node.turn === turn && node.step === step) {
      return {
        messageId: node.messageId,
        turn: node.turn,
        step: node.step,
        text: assistantText(node.blocks),
        interrupted: node.interrupted === true,
      }
    }
  }
  return null
}

function messageLiveIdentity(snapshot: ConversationSnapshot, messageId: string): Pick<LiveMessageIdentity, 'turn' | 'step'> | null {
  for (const node of snapshot.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return { turn: node.turn, step: node.step }
  }
  return null
}

interface SessionPlaybackObserverProps {
  sessionId: string
  session: ConversationSnapshot
  playback: PlaybackController
  live: LiveSpeechController
  settings: SettingsScope<TtsSettings>
}

/** Own the active-session boundary and feed its partial assistant output into realtime speech. */
export function SessionPlaybackObserver({ sessionId, session, playback, live, settings }: SessionPlaybackObserverProps): null {
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const active = useRef<{ turn: number; step: number } | null>(null)
  const wasRunning = useRef(session.running)
  const runArmed = useRef(!session.running)
  const latestMessageId = latestAssistantMessageId(session)
  const partial = session.partial
  const partialText = partial === null ? '' : assistantText(partial.blocks)

  useEffect(() => {
    active.current = null
    wasRunning.current = session.running
    runArmed.current = !session.running
    playback.activateSession(sessionId)
    live.activateSession(sessionId)
    return () => {
      active.current = null
      live.deactivateSession(sessionId)
      playback.deactivateSession(sessionId)
    }
  }, [live, playback, sessionId])

  useEffect(() => {
    const beganRun = session.running && !wasRunning.current
    wasRunning.current = session.running
    if (!session.running) runArmed.current = true
    else if (beganRun) {
      runArmed.current = true
      live.cancelSession(sessionId)
      playback.cancelPlayback(sessionId)
      active.current = null
    }

    playback.observeSession(sessionId, session.running && runArmed.current, latestMessageId)
    if (!resolvedSettings.enabled || !resolvedSettings.autoPlay || resolvedSettings.model !== 'mimo-v2.5-tts') {
      live.cancelSession(sessionId)
      active.current = null
      if (session.running) runArmed.current = false
      return
    }
    if (!runArmed.current) return
    if (partial !== null) {
      if (active.current !== null && (active.current.turn !== partial.turn || active.current.step !== partial.step)) {
        const previous = finalLiveMessage(session, active.current.turn, active.current.step)
        if (previous !== null) live.finish(sessionId, previous)
      }
      active.current = { turn: partial.turn, step: partial.step }
      live.observe(sessionId, partial.turn, partial.step, partialText)
      return
    }
    if (active.current !== null) {
      const final = finalLiveMessage(session, active.current.turn, active.current.step)
      if (final !== null) live.finish(sessionId, final)
      else if (!session.running) live.cancelSession(sessionId)
      active.current = null
    }
  }, [latestMessageId, live, partial, partialText, playback, resolvedSettings.autoPlay, resolvedSettings.enabled, resolvedSettings.model, session, sessionId, session.running])

  return null
}

interface ReadAloudActionProps {
  sessionId: string
  messageId: string
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  playback: PlaybackController
  live: LiveSpeechController
  settings: SettingsScope<TtsSettings>
  t: Translate
}

export function ReadAloudAction({ sessionId, messageId, useSession, playback, live, settings, t }: ReadAloudActionProps): ReactElement | null {
  const message = useSession((snapshot) => ({
    text: messageText(snapshot, messageId),
    time: messageTime(snapshot, messageId),
    latestMessageId: latestAssistantMessageId(snapshot),
    identity: messageLiveIdentity(snapshot, messageId),
    running: snapshot.running,
  }))
  const text = message.text
  const settingsSnapshot = useSettingsSnapshot(settings)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)

  useEffect(() => {
    if (text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || live.hasHandled(sessionId, message.identity) || message.running || message.latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return
    const cancel = window.setTimeout(() => {
      if (!live.hasHandled(sessionId, message.identity) && playback.claimAutomaticPlayback(sessionId, messageId)) void playback.toggle(sessionId, messageId, text, true)
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [live, message.identity, message.latestMessageId, message.running, message.time, messageId, playback, sessionId, settingsSnapshot.value?.autoPlay, settingsSnapshot.value?.enabled, text])

  if (settingsSnapshot.value?.enabled !== true || text.length === 0) return null

  const mine = view.sessionId === sessionId && view.messageId === messageId
  const status = mine ? view.status : 'idle'
  const source = mine ? view.source : null
  const liveActive = source === 'live' && (status === 'loading' || status === 'playing')
  const label = status === 'loading'
    ? liveActive ? t('action.cancel') : t('action.loading')
    : status === 'playing'
      ? liveActive ? t('action.stop') : t('action.pause')
      : status === 'paused'
        ? t('action.resume')
        : status === 'error'
          ? t('action.retry')
          : t('action.play')
  const error = mine ? view.error : null
  const errorText = error === null
    ? null
    : error === 'no-text'
      ? t('error.noText')
      : error === 'autoplay-blocked' || error === 'play-failed'
        ? t('error.play')
        : t('error.request')

  return (
    <>
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          className="xmimo-tts-action"
          aria-label={label}
          aria-pressed={status === 'playing' || liveActive}
          disabled={status === 'loading' && !liveActive}
          onClick={() => {
            if (mine && source === 'live' && (status === 'loading' || status === 'playing')) {
              live.stop(sessionId)
              playback.cancelPlayback(sessionId)
              return
            }
            live.cancelSession(sessionId)
            void playback.toggle(sessionId, messageId, text, false)
          }}
        >
          {status === 'loading'
            ? <IconLoadingOutline16 className="xmimo-tts-spin" />
            : status === 'playing'
              ? <IconPauseOutline16 />
              : <IconPlayOutline16 />}
        </button>
      </Tooltip>
      {errorText === null ? null : <span className="xmimo-tts-inline-error" role="status">{errorText}</span>}
    </>
  )
}
