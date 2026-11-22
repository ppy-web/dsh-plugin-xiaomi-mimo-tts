import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PlaybackController } from '../playback/playback-controller.js'
import { readComposerRecordingLevel, readComposerVoiceInput } from '../voice-input-activity.js'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../shared.js'
import type { Translate } from '../localization.js'
import { CaptionVisual } from './caption-visual.js'
import type { ReadingCaptions } from '../playback/reading-captions.js'
import { resolvedSettingsSnapshot, useSettingsSlice } from '../settings/scope.js'
import { useIsMainSessionView, type SessionRetainInfoSelector } from './session-retain-info.js'

interface ReadingCaptionBarProps {
  sessionId: string
  useSession: <T>(selector: (snapshot: SessionSnapshot) => T) => T
  useSessionRetainInfo?: SessionRetainInfoSelector
  playback: PlaybackController
  captions: ReadingCaptions
  settings: ConfigForm<TtsSettings>
  t: Translate
}

function selectCaptionSettings(snapshot: ConfigFormSnapshot<TtsSettings>) {
  const { showReadingCaptions, showAudioResponse, audioResponseStyle } = resolvedSettingsSnapshot(snapshot)
  return { showReadingCaptions, showAudioResponse, audioResponseStyle }
}


/** The previous segment provides context without being announced a second time. */
export function ReadingCaptionLines({ text, previousText, label }: { text: string; previousText: string; label: string }): ReactElement {
  return <section className="xmimo-reading-caption" role="region" aria-label={label} tabIndex={0}>
    {previousText && <div className="xmimo-reading-caption-previous" key={`previous:${previousText}`} aria-hidden="true" title={previousText}>{previousText}</div>}
    <div className="xmimo-reading-caption-current" title={text} key={`current:${text}`}>{text}</div>
  </section>
}

/** Adds a caption row to the host composer while the reader follows the bottom. */
export function ReadingCaptionBar({ sessionId, useSession, useSessionRetainInfo, playback, captions, settings, t }: ReadingCaptionBarProps): ReactElement | null {
  const isMainSession = useIsMainSessionView(useSessionRetainInfo)
  const { showReadingCaptions, showAudioResponse, audioResponseStyle } = useSettingsSlice(settings, selectCaptionSettings)
  const subscribe = useCallback((listener: () => void) => showReadingCaptions ? captions.subscribe(listener) : () => {}, [captions, showReadingCaptions])
  const view = useSyncExternalStore(subscribe, captions.getSnapshot, captions.getSnapshot)
  const running = useSession(snapshot => snapshot.running)
  const anchor = useRef<HTMLDivElement>(null)
  const readRecordingLevel = useCallback(() => readComposerRecordingLevel(anchor.current?.closest('[data-composer-seat]') ?? null), [])
  const [input, setInput] = useState(() => readComposerVoiceInput(null))
  useEffect(() => {
    const seat = anchor.current?.closest('[data-composer-seat]')
    if (!showAudioResponse || !seat) { setInput(readComposerVoiceInput(null)); return }
    const update = (): void => {
      const next = readComposerVoiceInput(seat)
      setInput(current => current.phase === next.phase && current.button === next.button
        && current.label === next.label && current.disabled === next.disabled ? current : next)
    }
    const observer = new MutationObserver(update)
    observer.observe(seat, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-voice-activity', 'disabled', 'aria-disabled', 'aria-label', 'hidden', 'inert'] })
    update()
    return () => observer.disconnect()
  }, [showAudioResponse, sessionId])
  const toggleVoiceInput = (): void => {
    const current = readComposerVoiceInput(anchor.current?.closest('[data-composer-seat]') ?? null)
    if (!current.disabled) current.button?.click()
  }
  const playbackView = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)
  const status = input.phase === 'transcribing' ? 'thinking' : input.phase === 'requesting' || input.phase === 'recording' ? 'listening' : playbackView.sessionId === sessionId && playbackView.status === 'playing' ? 'speaking' : playbackView.sessionId === sessionId && playbackView.status === 'loading' ? 'connecting' : playbackView.sessionId === sessionId && playbackView.status === 'error' ? 'error' : running ? 'thinking' : 'idle'
  const control = input.button !== null || input.phase !== 'idle' ? {
    label: input.label ?? t('conversation.voiceInput'), disabled: input.disabled, onClick: toggleVoiceInput,
  } : undefined
  const showText = showReadingCaptions && view.sessionId === sessionId && !view.paused && !!view.text
  const [retained, setRetained] = useState<{ sessionId: string; text: string; previousText: string } | null>(null)
  useEffect(() => {
    if (showText) {
      setRetained({ sessionId, text: view.text, previousText: view.previousText })
      return
    }
    const timer = window.setTimeout(() => setRetained(null), 500)
    return () => window.clearTimeout(timer)
  }, [showText, sessionId, view.text, view.previousText])
  const visibleText = showText ? view : showReadingCaptions && retained?.sessionId === sessionId ? retained : null
  const activeInSession = input.phase !== 'idle' || (playbackView.sessionId === sessionId && playbackView.status !== 'idle')
  const showVisual = showAudioResponse && (isMainSession || activeInSession)
  if (!showVisual && visibleText === null) return null
  return <div ref={anchor} className="xmimo-reading-caption-integrated">
    {showVisual && <CaptionVisual variant={audioResponseStyle} captions={captions} state={status} control={control} hoverable
      readRecordingLevel={input.phase === 'recording' ? readRecordingLevel : undefined} />}
    {visibleText && <div className={showText ? 'xmimo-caption-text' : 'xmimo-caption-text xmimo-caption-text-exiting'}>
      <ReadingCaptionLines text={visibleText.text} previousText={visibleText.previousText} label={t('settings.readingCaptions')} />
    </div>}
  </div>
}
