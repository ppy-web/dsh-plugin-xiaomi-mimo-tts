import type { CSSProperties, ReactElement, Ref } from 'react'
import { useId, useState } from 'react'
import { RiKey2Line } from 'react-icons/ri'
import type { TtsProvider } from '../../types/providers.js'
import { TTS_API_KEY_WHALE_ASSET_ROUTE, TTS_MIMO_LOGO_ASSET_ROUTE } from '../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { SettingFieldHeading } from './field-heading.js'
import { ModuleShell } from './module-shell.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import type { ApiKeyViewState } from './api-key-state.js'
import { useSettingsSearch } from './settings-search-context.js'

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
  provider: TtsProvider
  t: Translate
  value: string
  message: string
  status?: ApiKeyViewState | undefined
  invalid: boolean
  missing: boolean
  writable: boolean
  minimal: boolean
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement> | undefined
  onOpenProviderSettings?: ((bundle: string) => void) | undefined
}

export function ApiKeyModule({ t, provider, value, message, status, invalid, missing, writable, minimal, onChange, onOpenProviderSettings, inputRef }: ApiKeyModuleProps): ReactElement {
  const { hide } = useSettingsSearch()
  const engineView = useEngineState()
  const external = externalEngine()
  const hostDeepseek = !external && provider === 'deepseek'
  if (external) { message = `${external.name} · ${t(engineView.status !== 'ready' ? 'settings.externalDisconnected' : external.ready ? 'settings.externalManaged' : 'settings.externalNotReady')}`; invalid = false; writable = false }
  else if (hostDeepseek) { invalid = false; missing = false; writable = false }
  const tone = external
    ? (engineView.status !== 'ready' ? 'danger' : external.ready ? 'success' : 'pending')
    : hostDeepseek
      ? (status === 'recognized' ? 'success' : status === 'unavailable' ? 'danger' : 'warning')
      : (invalid || status === 'unrecognized' || status === 'pending-invalid')
        ? 'danger'
        : status === 'recognized'
          ? 'success'
          : status === 'pending-save'
            ? 'pending'
            : (missing || status === 'missing')
              ? 'warning'
              : 'neutral'
  const [bubbleKey, setBubbleKey] = useState<ApiKeyBubbleKey>(() => randomCopyKey(API_KEY_IDLE_COPY_KEYS))
  const inputId = useId()
  const messageId = useId()
  const keyUrl = provider === 'deepseek' ? 'https://platform.deepseek.com/api_keys' : provider === 'doubao' ? 'https://console.volcengine.com/speech/new/setting/apikeys?projectName=default' : provider === 'breeze' ? 'https://breezeblue.ai/zh?code=JHKLSJ' : 'https://platform.xiaomimimo.com?ref=GQDDDU'

  return <ModuleShell hidden={hide('apiKey')} className="xmimo-tts-settings-module xmimo-tts-api-key xmimo-ui-module-padded" title={<SettingFieldHeading
      label={<span className="xmimo-ui-module-title">
        <RiKey2Line size={14} aria-hidden="true" focusable="false" />
        {external ? external.name : provider === 'deepseek' ? t('settings.providerDeepseek') : provider === 'doubao' ? t('settings.providerDoubao') : provider === 'breeze' ? t('settings.providerBreeze') : <span
          className="xmimo-tts-api-key-logo"
          role="img"
          aria-label={t('settings.apiKey')}
          style={{ '--xmimo-tts-api-key-logo-image': `url(${hostRoute(TTS_MIMO_LOGO_ASSET_ROUTE)})` } as CSSProperties}
        />}
      </span>}
      suffix={external?.managementBundle && onOpenProviderSettings
        ? <button type="button" className="xmimo-tts-api-key-link" onClick={() => onOpenProviderSettings(external.managementBundle!)}>{t('settings.externalManage')}</button>
        : hostDeepseek && onOpenProviderSettings
          ? <button type="button" className="xmimo-tts-api-key-link" onClick={() => onOpenProviderSettings('@deepseek-ai/dsh-read-aloud-bundle')}>{t('settings.deepseekHostManage')}</button>
          : <a className="xmimo-tts-api-key-link" href={external ? external.managementPath ? hostRoute(external.managementPath) : undefined : keyUrl} aria-disabled={external !== null && !external.managementPath} target="_blank" rel="noopener noreferrer">{t(external?.managementPath ? 'settings.externalManage' : 'settings.getApiKey')}</a>}
      disabled={!writable}
      resettable={false}
    />} action={minimal ? undefined : <span className="xmimo-tts-api-key-decoration" aria-hidden="true" />}>
    <form className="xmimo-tts-api-key-content" onSubmit={event => { event.preventDefault(); event.stopPropagation() }}>
      <div className={`xmimo-tts-api-key-input${missing && !external && writable ? ' xmimo-tts-api-key-input-missing' : ''}`}>
      {missing && !external && writable ? <span className="xmimo-tts-shimmer-ring" aria-hidden="true" /> : null}
      {!minimal ? <span className="xmimo-tts-character-bubble xmimo-tts-api-key-bubble" aria-hidden="true">{t(bubbleKey)}</span> : null}
      {!minimal ? <span
        className="xmimo-tts-api-key-whale"
        style={{ backgroundImage: `url(${hostRoute(TTS_API_KEY_WHALE_ASSET_ROUTE)})` }}
        aria-hidden="true"
      /> : null}
      <input
          ref={inputRef}
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
          style={{ padding: '0 var(--xmimo-ui-space-4)' }}
      />
      </div>
      <small
        id={messageId}
        data-tone={tone}
        className={`xmimo-tts-api-key-message${invalid ? ' xmimo-tts-api-key-warning' : ''}${minimal && !invalid && !external ? ' xmimo-tts-visually-hidden' : ''}`}
        role={invalid ? 'alert' : 'status'}
      >
        <span className="xmimo-tts-api-key-status-dot" aria-hidden="true" />
        <span>{message}</span>
      </small>
    </form>
  </ModuleShell>
}
