import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconLoadingOutline16,
  IconPauseOutline16,
  IconPlayOutline16,
  Tooltip,
  extractMarkdownPlainText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { prepareTtsText, resolveTtsSettings, TTS_API_KEY_STATUS_ROUTE } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import type { Translate } from './localization.js'
import { LiveSpeechController, LocalSpeechController, PlaybackController } from './playback.js'
import type { LiveMessageIdentity } from './playback.js'
import { useSettingsSnapshot } from './settings-scope.js'

interface LegacyConversationSlice {
  readonly nodes: readonly {
    readonly kind: string
    readonly messageId?: string
    readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
    readonly turn: number
    readonly step: number
    readonly time: number
    readonly interrupted?: true
  }[]
  readonly partial: {
    readonly turn: number
    readonly step: number
    readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  } | null
}

interface ChatSnapshotCompat {
  readonly legacy: LegacyConversationSlice
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SessionStandardProps {
    useChat: <T>(selector: (snapshot: ChatSnapshotCompat) => T) => T
  }
}

function messageText(legacy: LegacyConversationSlice, messageId: string): string {
  for (const node of legacy.nodes) {
    if (node.kind !== 'assistant' || node.messageId !== messageId) continue
    const markdown = node.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('\n\n')
    return extractMarkdownPlainText(prepareTtsText(markdown)).trim()
  }
  return ''
}

function messageTime(legacy: LegacyConversationSlice, messageId: string): number | null {
  for (const node of legacy.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return node.time
  }
  return null
}

function latestAssistantMessageId(legacy: LegacyConversationSlice): string | null {
  for (let index = legacy.nodes.length - 1; index >= 0; index -= 1) {
    const node = legacy.nodes[index]
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


function finalLiveMessage(legacy: LegacyConversationSlice, turn: number, step: number): LiveMessageIdentity | null {
  for (let index = legacy.nodes.length - 1; index >= 0; index -= 1) {
    const node = legacy.nodes[index]
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

function messageLiveIdentity(legacy: LegacyConversationSlice, messageId: string): Pick<LiveMessageIdentity, 'turn' | 'step'> | null {
  for (const node of legacy.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return { turn: node.turn, step: node.step }
  }
  return null
}

let apiKeyStatusPromise: Promise<boolean> | null = null
let apiKeyStatusExpires = 0

function useApiKeySupported(active: boolean): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    if (!active) { setSupported(null); return }
    if (apiKeyStatusPromise === null || apiKeyStatusExpires <= Date.now()) {
      apiKeyStatusExpires = Date.now() + 2000
      apiKeyStatusPromise = fetch(TTS_API_KEY_STATUS_ROUTE, { headers: { accept: 'application/json' } })
        .then(async (response) => {
          if (!response.ok) throw new Error('api-key-status-failed')
          const result = await response.json() as { supported?: unknown }
          return result.supported === true
        })
        .catch(() => false)
    }
    let mounted = true
    void apiKeyStatusPromise.then((value) => { if (mounted) setSupported(value) })
    return () => { mounted = false }
  }, [active])
  return supported
}

interface SessionPlaybackObserverProps {
  sessionId: string
  // legacy fallback props
  session?: any
  messageId?: string
  // new hook-style props
  useSession?: <T>(selector: (snapshot: { running: boolean }) => T) => T
  useChat?: <T>(selector: (snapshot: ChatSnapshotCompat) => T) => T
  playback: PlaybackController
  live: LiveSpeechController
  local: LocalSpeechController
  settings: SettingsScope<TtsSettings>
}

/** Own the active-session boundary and feed its partial assistant output into realtime speech. */
export function SessionPlaybackObserver({ sessionId, session, useSession, useChat, playback, live, local, settings }: SessionPlaybackObserverProps): null {
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const apiKeySupported = useApiKeySupported(resolvedSettings.localSpeechMode !== 'disabled')
  live.setMaxPausedPcmBytes(resolvedSettings.maxPausedPcmBytes)
  local.setVoiceURI(resolvedSettings.localVoiceURI)
  local.setTimeoutMs(resolvedSettings.requestTimeoutMs)

  // runtime detection: prefer hooks when present, fall back to legacy session object
  const runningSnapshot = useSession ? useSession(s => s.running) : (session ? session.running : false)
  const legacy = useChat ? useChat(s => s.legacy) : (session ? (session as any) : { nodes: [], partial: null })

  const active = useRef<{ turn: number; step: number } | null>(null)
  const wasRunning = useRef(runningSnapshot)
  const runArmed = useRef(!runningSnapshot)
  const latestMessageId = latestAssistantMessageId(legacy)
  const partial = legacy.partial
  const partialText = partial === null ? '' : assistantText(partial.blocks)

  useEffect(() => {
    const localModel = resolvedSettings.model === 'mimo-v2.5-tts'
    const localFirst = localModel && resolvedSettings.localSpeechMode === 'local-first'
    const autoWithLocalFallback = localModel && resolvedSettings.localSpeechMode === 'auto'
    live.setFallbackHandler(autoWithLocalFallback ? (cursor, text) => local.observe(sessionId, cursor.turn, cursor.step, text) : null)
    local.setFallbackHandler(localFirst ? (cursor, text) => live.observe(sessionId, cursor.turn, cursor.step, text) : null)
    return () => {
      live.setFallbackHandler(null)
      local.setFallbackHandler(null)
    }
  }, [live, local, resolvedSettings.localSpeechMode, resolvedSettings.model, sessionId])

  useEffect(() => {
    active.current = null
    wasRunning.current = runningSnapshot
    runArmed.current = !runningSnapshot
    playback.activateSession(sessionId)
    live.activateSession(sessionId)
    local.activateSession(sessionId)
    return () => {
      active.current = null
      live.deactivateSession(sessionId)
      local.deactivateSession(sessionId)
      playback.deactivateSession(sessionId)
    }
  }, [live, local, playback, sessionId])

  useEffect(() => {
    const beganRun = runningSnapshot && !wasRunning.current
    wasRunning.current = runningSnapshot
    if (!runningSnapshot) runArmed.current = true
    else if (beganRun) {
      runArmed.current = true
      live.cancelSession(sessionId)
      local.cancelSession(sessionId)
      playback.cancelPlayback(sessionId)
      active.current = null
    }

    playback.observeSession(sessionId, runningSnapshot && runArmed.current, latestMessageId)
    const localModel = resolvedSettings.model === 'mimo-v2.5-tts'
    const realtimeSpeechEnabled = localModel && (resolvedSettings.localSpeechMode !== 'disabled' || resolvedSettings.format === 'pcm')
    if (!resolvedSettings.enabled || !resolvedSettings.autoPlay || !realtimeSpeechEnabled) {
      live.cancelSession(sessionId)
      local.cancel()
      active.current = null
      if (runningSnapshot) runArmed.current = false
      return
    }
    if (!runArmed.current) return
    if (partial !== null) {
      if (active.current !== null && (active.current.turn !== partial.turn || active.current.step !== partial.step)) {
        const previous = finalLiveMessage(legacy, active.current.turn, active.current.step)
        if (previous !== null) {
          const useLocal = localModel && resolvedSettings.localSpeechMode !== 'disabled'
            && (resolvedSettings.localSpeechMode === 'local-first' || (resolvedSettings.localSpeechMode === 'auto' && apiKeySupported === false))
          if (useLocal) local.finish(sessionId, previous)
          else live.finish(sessionId, previous)
        }
      }
      active.current = { turn: partial.turn, step: partial.step }
      const useLocal = localModel && resolvedSettings.localSpeechMode !== 'disabled'
        && (resolvedSettings.localSpeechMode === 'local-first' || (resolvedSettings.localSpeechMode === 'auto' && apiKeySupported === false))
      if (useLocal) local.observe(sessionId, partial.turn, partial.step, partialText)
      else live.observe(sessionId, partial.turn, partial.step, partialText)
      return
    }
    if (active.current !== null) {
      const final = finalLiveMessage(legacy, active.current.turn, active.current.step)
      if (final !== null) {
        const useLocal = localModel && resolvedSettings.localSpeechMode !== 'disabled'
          && (resolvedSettings.localSpeechMode === 'local-first' || (resolvedSettings.localSpeechMode === 'auto' && apiKeySupported === false))
        if (useLocal) local.finish(sessionId, final)
        else live.finish(sessionId, final)
      } else if (!runningSnapshot) {
        live.cancelSession(sessionId)
        local.cancelSession(sessionId)
      }
      active.current = null
    }
  }, [apiKeySupported, legacy, latestMessageId, live, local, partial, partialText, playback, resolvedSettings.autoPlay, resolvedSettings.enabled, resolvedSettings.format, resolvedSettings.localSp[...]