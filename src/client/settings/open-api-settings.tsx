import { useId, useState, type ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiCheckLine, RiDeleteBin6Line, RiEyeLine, RiEyeOffLine, RiFileCopyLine, RiKey2Line, RiLink, RiTerminalBoxLine } from 'react-icons/ri'
import { TTS_CAPABILITIES_ROUTE } from '../shared.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'
import type { ApiKeyStatus } from './api-key-state.js'
import { copyText } from './copy-text.js'
import { SettingFieldHeading } from './field-heading.js'
import { FieldInfo } from './controls/field-info.js'
import { useSettingsSearch } from './settings-search-context.js'

export interface OpenApiSettingsProps {
  t: Translate
  writable: boolean
  status: ApiKeyStatus
  value: string
  pendingClear: boolean
  lastSavedToken: string
  onChange: (value: string) => void
  onClear: () => void
}

/** Generate a 24-byte (48-hex-char) random token using Web Crypto. */
export function generateOpenApiToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Resolve the full base URL prefix for HTTP OpenAPI callers (keeping reverse-proxy subpaths). */
export function resolveOpenApiBaseUrl(): string {
  const route = hostRoute(TTS_CAPABILITIES_ROUTE).replace(/\/capabilities$/u, '')
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return `${window.location.origin}${route}`
  }
  return route
}

/** Build a ready-to-run shell snippet for testing the OpenAPI endpoints. */
export function buildOpenApiQuickSnippet(baseUrl: string, token: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/u, '')
  const resolvedToken = token.trim() || '<openApiToken>'
  return [
    `# DSH TTS OpenAPI`,
    `curl -H "Authorization: Bearer ${resolvedToken}" "${normalizedBase}/capabilities"`,
  ].join('\n')
}

/** Build generic Custom HTTP config parameters for /open-synthesize. */
export function buildOpenSynthesizeHttpConfig(baseUrl: string, token: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/u, '')
  const resolvedToken = token.trim() || '<openApiToken>'
  const lines = [
    `地址: ${normalizedBase}/open-synthesize`,
    `方法: POST`,
    `请求头: Authorization: Bearer ${resolvedToken}`,
    `请求体: {"text": "{text}", "format": "wav"}`,
    `响应: HTTP 200 原始音频二进制（WAV / MP3 / SILK）`,
  ]
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/iu.test(normalizedBase)) {
    lines.push('提示: 局域网其他设备访问时，请将 127.0.0.1 / localhost 替换为本机局域网 IP')
  }
  return lines.join('\n')
}

export function OpenApiSettings({
  t, writable, status, value, pendingClear, lastSavedToken, onChange, onClear,
}: OpenApiSettingsProps): ReactElement {
  const { hide } = useSettingsSearch()
  const inputId = useId()
  const hintId = useId()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'endpoint' | 'httpConfig' | 'token' | 'snippet' | 'failed'>('idle')

  const hasDraft = value.trim().length > 0
  const savedConfigured = status === 'recognized'
  const copyableToken = hasDraft ? value.trim() : pendingClear ? '' : lastSavedToken
  const endpointUrl = resolveOpenApiBaseUrl()

  const badgeKey = pendingClear
    ? 'settings.openApiPendingClear'
    : hasDraft
      ? 'settings.openApiPendingSave'
      : status === 'loading'
        ? 'settings.openApiStatusLoading'
        : savedConfigured
          ? 'settings.openApiStatusEnabled'
          : status === 'unavailable'
            ? 'settings.openApiStatusUnavailable'
            : 'settings.openApiStatusDisabled'

  const badgeTone = pendingClear || hasDraft
    ? 'pending'
    : savedConfigured
      ? 'enabled'
      : 'disabled'

  const triggerCopy = (kind: 'endpoint' | 'httpConfig' | 'token' | 'snippet', text: string): void => {
    void copyText(text).then(ok => setCopied(ok ? kind : 'failed'))
  }

  return <section className="xmimo-tts-format xmimo-tts-open-api" aria-label={t('settings.openApiTitle')} hidden={hide('openApi')}>
    <SettingFieldHeading
      label={t('settings.openApiTitle')}
      suffix={<>
        <FieldInfo label={t('settings.openApiTitle')} text={t('settings.openApiHint')} />
        <span className={`xmimo-tts-open-api-badge xmimo-tts-open-api-badge-${badgeTone}`} role="status">
          {t(badgeKey)}
        </span>
      </>}
      resettable={false}
      disabled={!writable}
    />
    <div className="xmimo-tts-open-api-grid">
      <div className="xmimo-tts-open-api-main">
        <div className="xmimo-tts-open-api-input-wrap">
          <input
            id={inputId}
            type={revealed ? 'text' : 'password'}
            value={value}
            name="xmimo-tts-open-api-token"
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            aria-label={t('settings.openApiTokenLabel')}
            aria-describedby={hintId}
            data-1p-ignore="true"
            data-bwignore="true"
            data-lpignore="true"
            placeholder={t(pendingClear ? 'settings.openApiPendingClearPlaceholder' : savedConfigured ? 'settings.openApiConfiguredPlaceholder' : 'settings.openApiPlaceholder')}
            disabled={!writable}
            onChange={event => { onChange(event.target.value); setCopied('idle') }}
          />
          <button
            type="button"
            className="xmimo-tts-open-api-eye"
            aria-label={t(revealed ? 'settings.openApiHideToken' : 'settings.openApiShowToken')}
            title={t(revealed ? 'settings.openApiHideToken' : 'settings.openApiShowToken')}
            disabled={!writable}
            onClick={() => setRevealed(current => !current)}
          >
            {revealed ? <RiEyeOffLine size={15} aria-hidden="true" /> : <RiEyeLine size={15} aria-hidden="true" />}
          </button>
        </div>
        <div className="xmimo-tts-open-api-endpoint">
          <small id={hintId}>{t('settings.openApiEndpointLabel')}：</small>
          <button
            type="button"
            className="xmimo-tts-open-api-endpoint-copy"
            title={t('settings.openApiCopyEndpointHint')}
            onClick={() => triggerCopy('endpoint', endpointUrl)}
          >
            <code>{endpointUrl}</code>
            {copied === 'endpoint' ? <RiCheckLine size={13} aria-hidden="true" /> : <RiFileCopyLine size={13} aria-hidden="true" />}
            {copied === 'endpoint' ? <span>{t('settings.openApiCopied')}</span> : null}
          </button>
        </div>
      </div>
      <div className="xmimo-tts-open-api-side">
        <div className="xmimo-tts-open-api-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!writable}
            onClick={() => {
              onChange(generateOpenApiToken())
              setRevealed(true)
              setCopied('idle')
            }}
          >
            <RiKey2Line size={14} aria-hidden="true" />
            <span>{t('settings.openApiGenerate')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!writable || (!savedConfigured && !hasDraft)}
            onClick={() => { onClear(); setCopied('idle') }}
          >
            <RiDeleteBin6Line size={14} aria-hidden="true" />
            <span>{t('settings.openApiClear')}</span>
          </Button>
        </div>
        <div className="xmimo-tts-open-api-copy-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={t('settings.openApiCopyHttpConfigHint')}
            onClick={() => triggerCopy('httpConfig', buildOpenSynthesizeHttpConfig(endpointUrl, copyableToken))}
          >
            {copied === 'httpConfig' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiLink size={14} aria-hidden="true" />}
            <span>{t(copied === 'httpConfig' ? 'settings.openApiCopied' : 'settings.openApiCopyHttpConfig')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!copyableToken}
            title={t(copyableToken ? 'settings.openApiCopyTokenHint' : 'settings.openApiCopyTokenDisabledHint')}
            onClick={() => triggerCopy('token', copyableToken)}
          >
            {copied === 'token' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiFileCopyLine size={14} aria-hidden="true" />}
            <span>{t(copied === 'token' ? 'settings.openApiCopied' : 'settings.openApiCopyToken')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => triggerCopy('snippet', buildOpenApiQuickSnippet(endpointUrl, copyableToken))}
          >
            {copied === 'snippet' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiTerminalBoxLine size={14} aria-hidden="true" />}
            <span>{t(copied === 'snippet' ? 'settings.openApiCopied' : 'settings.openApiCopySnippet')}</span>
          </Button>
        </div>
      </div>
    </div>
    {copied === 'failed' ? <small className="xmimo-tts-failed" role="alert">{t('settings.openApiCopyFailed')}</small> : null}
  </section>
}
