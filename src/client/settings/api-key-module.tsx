import type { CSSProperties, ReactElement } from 'react'
import { useId, useState } from 'react'
import { TTS_API_KEY_WHALE_ASSET_ROUTE, TTS_MIMO_LOGO_ASSET_ROUTE } from '../../shared.js'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'
import { hostRoute } from '../host-route.js'
import { ModuleShell } from './module-shell.js'

const API_KEY_IDLE_COPY_KEYS = [
  'settings.apiKeyIdleCopy1',
  'settings.apiKeyIdleCopy2',
  'settings.apiKeyIdleCopy3',
  'settings.apiKeyIdleCopy4',
] as const

const API_KEY_FOCUS_COPY_KEYS = [
  'settings.apiKeyFocusCopy1',
  'settings.apiKeyFocusCopy2',
  'settings.apiKeyFocusCopy3',
  'settings.apiKeyFocusCopy4',
] as const

type ApiKeyBubbleKey = typeof API_KEY_IDLE_COPY_KEYS[number] | typeof API_KEY_FOCUS_COPY_KEYS[number]

function randomCopyKey<T extends readonly string[]>(keys: T, current?: string): T[number] {
  if (keys.length < 2) return keys[0]!
  let next = keys[Math.floor(Math.random() * keys.length)]!
  while (next === current) next = keys[Math.floor(Math.random() * keys.length)]!
  return next
}

export interface ApiKeyModuleProps {
  t: Translate
  value: string
  message: string
  invalid: boolean
  clearable: boolean
  writable: boolean
  onChange: (value: string) => void
  onClear: () => void
}

export function ApiKeyModule({ t, value, message, invalid, clearable, writable, onChange, onClear }: ApiKeyModuleProps): ReactElement {
  const [bubbleKey, setBubbleKey] = useState<ApiKeyBubbleKey>(() => randomCopyKey(API_KEY_IDLE_COPY_KEYS))
  const inputId = useId()
  const messageId = useId()

  return <ModuleShell className="xmimo-tts-settings-module xmimo-tts-api-key xmimo-ui-module-padded" title={<SettingFieldHeading
      label={<span
        className="xmimo-tts-api-key-logo"
        role="img"
        aria-label={t('settings.apiKey')}
        style={{ '--xmimo-tts-api-key-logo-image': `url(${hostRoute(TTS_MIMO_LOGO_ASSET_ROUTE)})` } as CSSProperties}
      />}
      suffix={<>
        <a className="xmimo-tts-api-key-link" href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer">{t('settings.getApiKey')}</a>
        {clearable ? <button type="button" className="xmimo-tts-reset" disabled={!writable} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClear() }}>{t('settings.apiKeyClear')}</button> : null}
      </>}
      disabled={!writable}
      resettable={false}
    />} action={<span className="xmimo-tts-api-key-decoration" aria-hidden="true" />}>
    <div className="xmimo-tts-api-key-content">
      <div className="xmimo-tts-api-key-input">
      <span className="xmimo-tts-character-bubble xmimo-tts-api-key-bubble" aria-hidden="true">{t(bubbleKey)}</span>
      <span
        className="xmimo-tts-api-key-whale"
        style={{ backgroundImage: `url(${hostRoute(TTS_API_KEY_WHALE_ASSET_ROUTE)})` }}
        aria-hidden="true"
      />
      <input
        id={inputId}
        type="password"
        value={value}
        name="xmimo-tts-api-key"
        autoComplete="new-password"
        autoCorrect="off"
        spellCheck={false}
        aria-label={t('settings.apiKey')}
        aria-autocomplete="none"
        aria-describedby={messageId}
        aria-invalid={invalid}
        data-1p-ignore="true"
        data-bwignore="true"
        data-lpignore="true"
        placeholder={t('settings.secretPlaceholder')}
        disabled={!writable}
        onFocus={() => { setBubbleKey((current) => randomCopyKey(API_KEY_FOCUS_COPY_KEYS, current)) }}
        onBlur={() => { setBubbleKey((current) => randomCopyKey(API_KEY_IDLE_COPY_KEYS, current)) }}
        onChange={(event) => { onChange(event.target.value) }}
      />
      </div>
      <small id={messageId} className={invalid ? 'xmimo-tts-api-key-warning' : undefined} role={invalid ? 'alert' : 'status'}>
        {message}
      </small>
    </div>
  </ModuleShell>
}
