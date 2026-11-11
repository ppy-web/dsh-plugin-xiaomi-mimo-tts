import type { ReactElement, RefObject } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine, RiPushpinFill, RiPushpinLine } from 'react-icons/ri'
import { BREEZE_AUDIO_TAG_GROUPS, type BreezeAudioTagLanguage } from '../breeze-audio-tags.js'
import { XIAOMI_AUDIO_TAG_GROUPS } from '../../../text/xiaomi-audio-tags.js'
import type { Translate } from '../../localization.js'

/** Continuous insertion keeps the palette open only while working with its text field. */
export function AudioTagPicker({ provider, disabled, textRef, onInsert, t, tags }: { provider: 'xiaomi' | 'breeze' | 'external'; disabled: boolean; textRef: RefObject<HTMLTextAreaElement | null>; onInsert: (tag: string, placement?: 'start') => void; t: Translate; tags?: { value: string; name: string }[] | undefined }): ReactElement {
  const [language, setLanguage] = useState<BreezeAudioTagLanguage>('zh')
  const [open, setOpen] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const panelId = useId()
  const anchorName = `--xmimo-audio-tags-${panelId.replaceAll(':', '')}`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const expanded = open && !disabled
  useEffect(() => {
    if (!expanded) return
    const dismissOutside = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Node) || rootRef.current?.contains(target) || panelRef.current?.contains(target)
        || (continuous && textRef.current?.contains(target))) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
    }
  }, [expanded, continuous, textRef])
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
  const groups: readonly { label: string; tags: readonly string[]; placement?: 'start' }[] = provider === 'xiaomi'
    ? XIAOMI_AUDIO_TAG_GROUPS.map(group => ({ label: group[language], tags: (language === 'zh' ? group.tags : group.english).map(tag => `(${tag})`), ...('placement' in group ? { placement: group.placement } : {}) }))
    : provider === 'external' ? [{ label: t('settings.breezeAudioTags'), tags: (tags ?? []).map(tag => tag.value) }] : BREEZE_AUDIO_TAG_GROUPS[language]
  return <div ref={rootRef} className={expanded ? 'xmimo-tts-breeze-audio-tags xmimo-tts-breeze-audio-tags-open' : 'xmimo-tts-breeze-audio-tags'}>
    <button
      type="button"
      ref={triggerRef}
      style={{ anchorName }}
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
      role="dialog" data-window-drag-exclude aria-label={t('settings.breezeAudioTags')} style={{ positionAnchor: anchorName }}>
      <small>{t(provider === 'external' ? 'settings.externalOptionsHint' : provider === 'xiaomi' ? 'settings.xiaomiAudioTagsHint' : 'settings.breezeAudioTagsHint')}</small>
      <div className="xmimo-tts-settings-segmented-wrap">
        {provider !== 'external' ? <><Button type="button" aria-pressed={language === 'zh'} variant={language === 'zh' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('zh')}>{t('settings.breezeAudioTagsChinese')}</Button>
        <Button type="button" aria-pressed={language === 'en'} variant={language === 'en' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('en')}>{t('settings.breezeAudioTagsEnglish')}</Button></> : null}
        <Button type="button" className="xmimo-tts-audio-tags-continuous" aria-label={t('settings.audioTagsContinuous')} aria-pressed={continuous} title={t('settings.audioTagsContinuousHint')} variant={continuous ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setContinuous(value => !value)}>
          {continuous ? <RiPushpinFill size={14} aria-hidden="true" /> : <RiPushpinLine size={14} aria-hidden="true" />}
        </Button>
      </div>
      {groups.map(group => <div key={group.label} className="xmimo-tts-breeze-audio-tag-group">
        <strong>{group.label}</strong>
        <div className="xmimo-tts-breeze-audio-tag-list">
          {group.tags.map(tag => <Button key={tag} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { if (!continuous) setOpen(false); onInsert(tag, group.placement) }}>{tag}</Button>)}
        </div>
      </div>)}
    </div>, document.body) : null}
  </div>
}
