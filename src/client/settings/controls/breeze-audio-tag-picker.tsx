import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine } from 'react-icons/ri'
import { BREEZE_AUDIO_TAG_GROUPS, type BreezeAudioTagLanguage } from '../breeze-audio-tags.js'
import type { Translate } from '../../localization.js'

const PANEL_ID = 'xmimo-tts-breeze-audio-tag-panel'

/** Inline disclosure under the preview textarea; a tag inserts at the caret and keeps the list open. */
export function BreezeAudioTagPicker({ disabled, onInsert, t }: { disabled: boolean; onInsert: (tag: string) => void; t: Translate }): ReactElement {
  const [language, setLanguage] = useState<BreezeAudioTagLanguage>('zh')
  const [open, setOpen] = useState(false)
  const groups = BREEZE_AUDIO_TAG_GROUPS[language]
  return <div className={open ? 'xmimo-tts-breeze-audio-tags xmimo-tts-breeze-audio-tags-open' : 'xmimo-tts-breeze-audio-tags'}>
    <button
      type="button"
      className="xmimo-tts-breeze-audio-tags-toggle"
      aria-expanded={open}
      aria-controls={PANEL_ID}
      disabled={disabled}
      onClick={() => setOpen(value => !value)}
    >
      <span>{t('settings.breezeAudioTags')}</span>
      <RiArrowDownSLine className="xmimo-tts-chevron" size={14} aria-hidden="true" focusable="false" />
    </button>
    {open ? <div id={PANEL_ID} className="xmimo-tts-breeze-audio-tags-panel">
      <small>{t('settings.breezeAudioTagsHint')}</small>
      <div className="xmimo-tts-settings-segmented-wrap">
        <Button type="button" variant={language === 'zh' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('zh')}>{t('settings.breezeAudioTagsChinese')}</Button>
        <Button type="button" variant={language === 'en' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('en')}>{t('settings.breezeAudioTagsEnglish')}</Button>
      </div>
      {groups.map(group => <div key={group.label} className="xmimo-tts-breeze-audio-tag-group">
        <strong>{group.label}</strong>
        <div className="xmimo-tts-breeze-audio-tag-list">
          {group.tags.map(tag => <Button key={tag} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onInsert(tag)}>{tag}</Button>)}
        </div>
      </div>)}
    </div> : null}
  </div>
}
