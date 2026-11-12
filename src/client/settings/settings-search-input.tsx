import { useRef, useState, type ReactElement } from 'react'
import { LuSearch, LuX } from 'react-icons/lu'
import type { Translate } from '../localization.js'

export function SettingsSearchInput({ t, query, onQueryChange }: { t: Translate; query: string; onQueryChange: (query: string) => void }): ReactElement {
  const [text, setText] = useState(query)
  const composing = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const clear = (): void => {
    setText('')
    onQueryChange('')
    input.current?.focus()
  }

  return <div role="search" aria-label={t('settings.search')} className="xmimo-tts-settings-search">
    <LuSearch size={14} aria-hidden="true" />
    <input ref={input} type="search" aria-label={t('settings.search')} placeholder={t('settings.searchPlaceholder')}
      value={text} autoComplete="off"
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={event => {
        composing.current = false
        setText(event.currentTarget.value)
        onQueryChange(event.currentTarget.value)
      }}
      onChange={event => {
        setText(event.currentTarget.value)
        if (!composing.current) onQueryChange(event.currentTarget.value)
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !text || composing.current || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        clear()
      }}
    />
    {text ? <button type="button" className="xmimo-voice-reading-action xmimo-tts-search-clear"
      aria-label={t('settings.searchClear')} onClick={clear}><LuX size={14} aria-hidden="true" /></button> : null}
  </div>
}
