import type { ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine } from 'react-icons/ri'
import { BREEZE_AUDIO_TAG_GROUPS, type BreezeAudioTagLanguage } from '../breeze-audio-tags.js'
import type { Translate } from '../../localization.js'

/** Anchored tag palette; selection inserts at the caret and returns to the text. */
export function BreezeAudioTagPicker({ disabled, onInsert, t }: { disabled: boolean; onInsert: (tag: string) => void; t: Translate }): ReactElement {
  const [language, setLanguage] = useState<BreezeAudioTagLanguage>('zh')
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const expanded = open && !disabled
  const position = useAnchoredPosition({ open: expanded, anchorRef: triggerRef, panelRef, side: 'bottom', align: 'start', gap: 6, margin: 12, layoutKey: language })
  useDismissOnOutsidePointer(rootRef, expanded, setOpen, panelRef)
  useEffect(() => {
    if (!expanded) return
    panelRef.current?.querySelector('button')?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [expanded])
  const groups = BREEZE_AUDIO_TAG_GROUPS[language]
  return <div ref={rootRef} className={expanded ? 'xmimo-tts-breeze-audio-tags xmimo-tts-breeze-audio-tags-open' : 'xmimo-tts-breeze-audio-tags'}>
    <button
      type="button"
      ref={triggerRef}
      className="xmimo-tts-breeze-audio-tags-toggle"
      aria-expanded={expanded}
      aria-controls={expanded ? panelId : undefined}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={() => setOpen(value => !value)}
    >
      <span>{t('settings.breezeAudioTags')}</span>
      <RiArrowDownSLine className="xmimo-tts-chevron" size={14} aria-hidden="true" focusable="false" />
    </button>
    {expanded ? createPortal(<div ref={panelRef} id={panelId} className="xmimo-ui-scope xmimo-tts-breeze-audio-tags-panel"
      role="dialog" aria-label={t('settings.breezeAudioTags')} style={position ?? { visibility: 'hidden' }}
      onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !rootRef.current?.contains(event.relatedTarget)) setOpen(false) }}>
      <small>{t('settings.breezeAudioTagsHint')}</small>
      <div className="xmimo-tts-settings-segmented-wrap">
        <Button type="button" aria-pressed={language === 'zh'} variant={language === 'zh' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('zh')}>{t('settings.breezeAudioTagsChinese')}</Button>
        <Button type="button" aria-pressed={language === 'en'} variant={language === 'en' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('en')}>{t('settings.breezeAudioTagsEnglish')}</Button>
      </div>
      {groups.map(group => <div key={group.label} className="xmimo-tts-breeze-audio-tag-group">
        <strong>{group.label}</strong>
        <div className="xmimo-tts-breeze-audio-tag-list">
          {group.tags.map(tag => <Button key={tag} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setOpen(false); onInsert(tag) }}>{tag}</Button>)}
        </div>
      </div>)}
    </div>, document.body) : null}
  </div>
}
