import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { ReadingCaptions } from '../playback/reading-captions.js'
import { useSettingsSnapshot } from '../settings/scope.js'

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

interface ReadingCaptionBarProps {
  sessionId: string
  captions: ReadingCaptions
  settings: ConfigForm<TtsSettings>
  t: Translate
}
interface Position { left: number; bottom: number; width: number }

/** The previous segment provides context without being announced a second time. */
export function ReadingCaptionLines({ text, previousText, label }: { text: string; previousText: string; label: string }): ReactElement {
  return <section className="xmimo-reading-caption" role="region" aria-label={label} tabIndex={0}>
    {previousText && <div className="xmimo-reading-caption-previous" aria-hidden="true" title={previousText}>{previousText}</div>}
    <div className="xmimo-reading-caption-current" title={text} key={text}>{text}</div>
  </section>
}

/** Mounts only an absolute anchor in the slot; the visible UI is portaled out of the composer. */
export function ReadingCaptionBar({ sessionId, captions, settings, t }: ReadingCaptionBarProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(settings)
  const enabled = resolveTtsSettings(snapshot.value).showReadingCaptions
  const subscribe = useCallback((listener: () => void) => enabled ? captions.subscribe(listener) : () => {}, [captions, enabled])
  const view = useSyncExternalStore(subscribe, captions.getSnapshot, captions.getSnapshot)
  const anchor = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const visible = enabled && view.sessionId === sessionId && !view.paused && !!view.text

  useClientLayoutEffect(() => {
    if (!visible || !anchor.current) { setPosition(null); return }
    const seat = anchor.current.closest('[data-composer-seat]')
    if (!seat) { setPosition(null); return }
    let card: Element | null = null
    const measure = (): void => {
      const nextCard = seat.querySelector('[data-composer-card]')
      if (nextCard !== card) { if (card) resize.unobserve(card); card = nextCard; if (card) resize.observe(card) }
      if (!card) { setPosition(null); return }
      const rect = card.getBoundingClientRect()
      const visible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth
      const width = Math.max(0, Math.min(rect.width, window.innerWidth - 24, 520))
      const left = Math.max(width / 2 + 12, Math.min(window.innerWidth - width / 2 - 12, rect.left + rect.width / 2))
      const next = visible ? { left, bottom: window.innerHeight - rect.top + 10, width } : null
      setPosition(previous => previous?.left === next?.left && previous?.bottom === next?.bottom && previous?.width === next?.width ? previous : next)
    }
    const resize = new ResizeObserver(measure)
    resize.observe(seat)
    const mutations = new MutationObserver(measure)
    mutations.observe(seat, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    measure()
    return () => { resize.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure) }
  }, [visible, sessionId])

  if (!enabled) return null
  return <>
    <span ref={anchor} className="xmimo-reading-caption-anchor" aria-hidden="true" />
    {position && visible && typeof document !== 'undefined' && createPortal(
      <div className="xmimo-reading-caption-overlay" style={{ left: position.left, bottom: position.bottom, width: position.width }}>
        <ReadingCaptionLines text={view.text} previousText={view.previousText} label={t('settings.readingCaptions')} />
      </div>, document.body)}
  </>
}
