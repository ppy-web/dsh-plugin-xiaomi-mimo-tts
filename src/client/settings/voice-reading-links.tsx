import type { ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { AiFillGithub, AiFillSetting, AiOutlineQq } from 'react-icons/ai'
import { IconCloseOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_QQ_GROUP_ASSET_ROUTE, TTS_QQ_GROUP_NUMBER } from '../../shared.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'
import { SOURCE_URL } from './plugin-links.js'

interface VoiceReadingHeaderActionsProps {
  t: Translate
  openPluginSettings: () => void
}

/**
 * Title-row shortcuts: source, the QQ discussion group, and plugin settings.
 *
 * All three are 32px icon-only targets that name themselves through a tooltip
 * and an aria-label, and each glyph stays in the neutral secondary label color
 * so the brand accent remains reserved for primary actions.
 */
export function VoiceReadingHeaderActions({ t, openPluginSettings }: VoiceReadingHeaderActionsProps): ReactElement {
  return <div className="xmimo-voice-reading-actions">
    <Tooltip label={t('settings.voiceReadingSource')} side="bottom" align="end" portal>
      <a className="xmimo-voice-reading-action" href={SOURCE_URL} target="_blank" rel="noopener noreferrer" aria-label={t('settings.voiceReadingSource')}>
        <AiFillGithub size={16} aria-hidden="true" focusable="false" />
      </a>
    </Tooltip>
    <QqGroupAction t={t} />
    <Tooltip label={t('settings.voiceReadingPluginSettings')} side="bottom" align="end" portal>
      <button type="button" className="xmimo-voice-reading-action" aria-label={t('settings.voiceReadingPluginSettings')} onClick={openPluginSettings}>
        <AiFillSetting size={16} aria-hidden="true" focusable="false" />
      </button>
    </Tooltip>
  </div>
}

/**
 * QQ group entry. Activating it opens the QR capsule directly: no protocol
 * handler attempt, no waiting on QQ, just the invite that works everywhere —
 * phone scan, or the group number typed into QQ by hand.
 */
export function QqGroupAction({ t }: { t: Translate }): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const close = (): void => { setOpen(false) }

  useEffect(() => {
    if (!open) return
    // Move focus into the capsule so keyboard users land on its dismiss button
    // rather than leaving it behind the trigger.
    closeRef.current?.focus({ preventScroll: true })
    const onPointerDown = (event: Event): void => {
      if (wrapperRef.current?.contains(event.target as Node)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
      triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const label = t('settings.voiceReadingQq')
  return <span className="xmimo-voice-reading-qq" ref={wrapperRef}>
    <Tooltip label={label} side="bottom" align="end" portal>
      <button
        ref={triggerRef}
        type="button"
        className="xmimo-voice-reading-action"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => { setOpen((current) => !current) }}
      >
        <AiOutlineQq size={16} aria-hidden="true" focusable="false" />
      </button>
    </Tooltip>
    {open ? <div className="xmimo-voice-reading-qq-panel" id={panelId} role="dialog" aria-label={label}>
      <button
        ref={closeRef}
        type="button"
        className="xmimo-voice-reading-qq-close"
        aria-label={t('settings.voiceReadingQqClose')}
        onClick={() => {
          close()
          triggerRef.current?.focus({ preventScroll: true })
        }}
      >
        <IconCloseOutlineRegular aria-hidden="true" />
      </button>
      <img className="xmimo-voice-reading-qq-code" src={hostRoute(TTS_QQ_GROUP_ASSET_ROUTE)} width={190} height={190} alt={t('settings.voiceReadingQqCodeAlt')} />
      <div className="xmimo-voice-reading-qq-meta">
        <span className="xmimo-voice-reading-qq-group">{label}</span>
        <code className="xmimo-voice-reading-qq-number">{TTS_QQ_GROUP_NUMBER}</code>
      </div>
    </div> : null}
  </span>
}
