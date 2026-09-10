import type { CSSProperties, ReactElement } from 'react'
import { useState } from 'react'
import { TTS_API_KEY_WHALE_ASSET_ROUTE, TTS_MIMO_LOGO_ASSET_ROUTE } from '../../shared.js'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'
import { hostRoute } from '../host-route.js'

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
  warning: boolean
  overridden: boolean
  writable: boolean
  onChange: (value: string) => void
}

export function ApiKeyModule({ t, value, message, warning, overridden, writable, onChange }: ApiKeyModuleProps): ReactElement {
  const [bubbleKey, setBubbleKey] = useState<ApiKeyBubbleKey>(() => randomCopyKey(API_KEY_IDLE_COPY_KEYS))

  return <section className="xmimo-tts-settings-module xmimo-tts-api-key xmimo-ui-module xmimo-ui-module-padded">
    <SettingFieldHeading
      label={<span
        className="xmimo-tts-api-key-logo"
        role="img"
        aria-label={t('settings.apiKey')}
        style={{ '--xmimo-tts-api-key-logo-image': `url(${hostRoute(TTS_MIMO_LOGO_ASSET_ROUTE)})` } as CSSProperties}
      />}
      suffix={<a className="xmimo-tts-api-key-link" href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer">{t('settings.getApiKey')}</a>}
      overriddenLabel={t('settings.apiKeyConfigured')}
      overridden={overridden}
      resettable={false}
      disabled={!writable}
    />
    <div className="xmimo-tts-api-key-input">
      <span className="xmimo-tts-character-bubble xmimo-tts-api-key-bubble" aria-live="polite">{t(bubbleKey)}</span>
      <span
        className="xmimo-tts-api-key-whale"
        style={{ backgroundImage: `url(${hostRoute(TTS_API_KEY_WHALE_ASSET_ROUTE)})` }}
        aria-hidden="true"
      />
      <input
        type="password"
        value={value}
        name="xmimo-tts-api-key"
        autoComplete="new-password"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="none"
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
    <small className={warning ? 'xmimo-tts-api-key-warning' : undefined} role={warning ? 'alert' : undefined}>
      {message}
    </small>
  </section>
}
