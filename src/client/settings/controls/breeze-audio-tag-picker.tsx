import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { BREEZE_AUDIO_TAG_GROUPS, type BreezeAudioTagLanguage } from '../breeze-audio-tags.js'
import type { Translate } from '../../localization.js'

export function BreezeAudioTagPicker({ disabled, onInsert, t }: { disabled: boolean; onInsert: (tag: string) => void; t: Translate }): ReactElement {
  const [language, setLanguage] = useState<BreezeAudioTagLanguage>('zh')
  const groups = BREEZE_AUDIO_TAG_GROUPS[language]
  return <details className="xmimo-tts-breeze-audio-tags">
    <summary>{t('settings.breezeAudioTags')}</summary>
    <small>{t('settings.breezeAudioTagsHint')}</small>
    <div className="xmimo-tts-settings-segmented-wrap">
      <Button type="button" variant={language === 'zh' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('zh')}>{t('settings.breezeAudioTagsChinese')}</Button>
      <Button type="button" variant={language === 'en' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('en')}>{t('settings.breezeAudioTagsEnglish')}</Button>
    </div>
    {groups.map(group => <div key={group.label} className="xmimo-tts-breeze-audio-tag-group">
      <strong>{group.label}</strong>
      <div>{group.tags.map(tag => <Button key={tag} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onInsert(tag)}>{tag}</Button>)}</div>
    </div>)}
  </details>
}
