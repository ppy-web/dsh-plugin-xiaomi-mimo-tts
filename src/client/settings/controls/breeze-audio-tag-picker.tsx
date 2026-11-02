import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { BREEZE_AUDIO_TAG_GROUPS, type BreezeAudioTagLanguage } from '../breeze-audio-tags.js'
import type { Translate } from '../../localization.js'

export function BreezeAudioTagPicker({ disabled, onInsert, t }: { disabled: boolean; onInsert: (tag: string) => void; t: Translate }): ReactElement {
  const [language, setLanguage] = useState<BreezeAudioTagLanguage>('zh')
  const details = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (details.current?.open && event.target instanceof Node && !details.current.contains(event.target)) details.current.open = false
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && details.current?.open) { details.current.open = false; details.current.querySelector('summary')?.focus() }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [])
  const groups = BREEZE_AUDIO_TAG_GROUPS[language]
  return <details ref={details} className="xmimo-tts-breeze-audio-tags">
    <summary aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault() }}>{t('settings.breezeAudioTags')} <span aria-hidden="true">⌄</span></summary>
    <div className="xmimo-tts-breeze-audio-tags-popup">
    <small>{t('settings.breezeAudioTagsHint')}</small>
    <div className="xmimo-tts-settings-segmented-wrap">
      <Button type="button" variant={language === 'zh' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('zh')}>{t('settings.breezeAudioTagsChinese')}</Button>
      <Button type="button" variant={language === 'en' ? 'primary' : 'ghost'} size="sm" disabled={disabled} onClick={() => setLanguage('en')}>{t('settings.breezeAudioTagsEnglish')}</Button>
    </div>
    {groups.map(group => <div key={group.label} className="xmimo-tts-breeze-audio-tag-group">
      <strong>{group.label}</strong>
      <div>{group.tags.map(tag => <Button key={tag} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { onInsert(tag); if (details.current) details.current.open = false }}>{tag}</Button>)}</div>
    </div>)}
    </div>
  </details>
}
