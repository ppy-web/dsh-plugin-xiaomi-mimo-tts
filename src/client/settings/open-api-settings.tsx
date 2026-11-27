import { useEffect, useId, useState, type ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiCheckLine, RiDeleteBin6Line, RiEyeLine, RiEyeOffLine, RiFileCopyLine, RiKey2Line, RiLink, RiRefreshLine, RiTerminalBoxLine } from 'react-icons/ri'
import { DEFAULT_PASSPORT_SETTINGS, PASSPORT_STATUS_ROUTE, PASSPORT_TOKEN_COPY_ROUTE, type PassportConnectionStatus } from '../../types/passport.js'
import { TTS_CAPABILITIES_ROUTE, TTS_DESKTOP_WRITE_HEADER } from '../shared.js'
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

type CopyKind = 'idle' | 'endpoint' | 'token' | 'snippet' | 'passportUrl' | 'passportConfig' | 'passportCurl' | 'failed'

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

/** Resolve the direct synthesis URL served by AI Passport's independent HTTP listener. */
export function resolvePassportSynthesizeUrl(status?: Pick<PassportConnectionStatus, 'host' | 'port'> | null): string {
  const rawHost = status?.host?.trim() || ''
  const host = !rawHost || rawHost === '0.0.0.0' || rawHost === '::' ? '127.0.0.1' : rawHost
  const port = status?.port ?? DEFAULT_PASSPORT_SETTINGS.port
  const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${formattedHost}:${port}/api/synthesize`
}

/** Build generic Custom HTTP parameters for AI Passport's /api/synthesize endpoint. */
export function buildPassportSynthesizeHttpConfig(url: string, lanAddress?: string, token?: string): string {
  const normalizedUrl = url.replace(/\/+$/u, '')
  const resolvedToken = token?.trim() || '<AI Passport 访问令牌>'
  const lines = [
    `地址: ${normalizedUrl}`,
    `方法: POST`,
    `请求头: Authorization: Bearer ${resolvedToken}`,
    `请求体: {"text": "{text}", "format": "wav"}`,
    `音频字段: 留空`,
  ]
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?(?:\/|$)/iu.test(normalizedUrl)) {
    const port = normalizedUrl.match(/^https?:\/\/[^/:]+:(\d+)/iu)?.[1] ?? String(DEFAULT_PASSPORT_SETTINGS.port)
    if (lanAddress?.trim()) lines.push(`局域网参考: http://${lanAddress.trim()}:${port}/api/synthesize`)
    else lines.push('提示: 仅本机访问可用 127.0.0.1；如需局域网其他设备访问，请将 AI Passport 监听地址设为 0.0.0.0 并替换为电脑局域网 IP')
  }
  return lines.join('\n')
}

/** Build a curl test command for AI Passport's /api/synthesize endpoint. */
export function buildPassportSynthesizeCurl(url: string, token?: string): string {
  const resolvedToken = token?.trim() || '<AI Passport 访问令牌>'
  return `curl -X POST "${url.replace(/\/+$/u, '')}" -H "Authorization: Bearer ${resolvedToken}" -H "Content-Type: application/json" -d "{\\"text\\":\\"测试语音\\",\\"format\\":\\"wav\\"}" --output speech.wav`
}

async function fetchPassportCopyToken(): Promise<string> {
  try {
    const response = await fetch(hostRoute(PASSPORT_TOKEN_COPY_ROUTE), {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { [TTS_DESKTOP_WRITE_HEADER]: '1' },
    })
    if (!response.ok) return ''
    const body = await response.json() as { token?: unknown }
    return typeof body.token === 'string' ? body.token.trim() : ''
  } catch {
    return ''
  }
}

export function OpenApiSettings({
  t, writable, status, value, pendingClear, lastSavedToken, onChange, onClear,
}: OpenApiSettingsProps): ReactElement {
  const { hide } = useSettingsSearch()
  const inputId = useId()
  const hintId = useId()
  const passportHintId = useId()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<CopyKind>('idle')
  const [passportStatus, setPassportStatus] = useState<PassportConnectionStatus | null>(null)
  const [passportPhase, setPassportPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [passportRefresh, setPassportRefresh] = useState(0)

  useEffect(() => {
    const request = new AbortController()
    setPassportPhase('loading')
    void fetch(hostRoute(PASSPORT_STATUS_ROUTE), { cache: 'no-store', credentials: 'same-origin', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw new Error('passport-status-unavailable')
        const body = await response.json() as PassportConnectionStatus
        if (!request.signal.aborted && typeof body.configured === 'boolean') {
          setPassportStatus(body)
          setPassportPhase('ready')
        }
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setPassportStatus(null)
          setPassportPhase('unavailable')
        }
      })
    return () => request.abort()
  }, [passportRefresh])

  const hasDraft = value.trim().length > 0
  const savedConfigured = status === 'recognized'
  const copyableToken = hasDraft ? value.trim() : pendingClear ? '' : lastSavedToken
  const endpointUrl = resolveOpenApiBaseUrl()
  const passportUrl = resolvePassportSynthesizeUrl(passportStatus)
  const passportLan = passportStatus?.addresses?.[0]?.address
  const passportListening = passportPhase === 'ready' && !!passportStatus?.listening

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

  const passportBadgeKey = passportPhase === 'loading'
    ? 'settings.openApiStatusLoading'
    : passportListening
      ? 'settings.passportApiStatusListening'
      : 'settings.passportApiStatusStopped'

  const passportBadgeTone = passportListening ? 'enabled' : 'disabled'

  const triggerCopy = (kind: Exclude<CopyKind, 'idle' | 'failed'>, text: string): void => {
    void copyText(text).then(ok => setCopied(ok ? kind : 'failed'))
  }

  const triggerPassportCopy = (kind: 'passportConfig' | 'passportCurl', build: (token: string) => string): void => {
    void (async () => {
      const token = await fetchPassportCopyToken()
      const ok = await copyText(build(token))
      setCopied(ok ? kind : 'failed')
    })()
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

    <div className="xmimo-tts-open-api-passport" aria-label={t('settings.passportApiTitle')}>
      <SettingFieldHeading
        label={t('settings.passportApiTitle')}
        suffix={<>
          <FieldInfo label={t('settings.passportApiTitle')} text={t('settings.passportApiHint')} />
          <span className={`xmimo-tts-open-api-badge xmimo-tts-open-api-badge-${passportBadgeTone}`} role="status">
            {t(passportBadgeKey)}
          </span>
        </>}
        resettable={false}
        disabled={!writable}
      />
      <div className="xmimo-tts-open-api-grid">
        <div className="xmimo-tts-open-api-main">
          <div className="xmimo-tts-open-api-endpoint">
            <small id={passportHintId}>{t('settings.passportApiEndpointLabel')}：</small>
            <button
              type="button"
              className="xmimo-tts-open-api-endpoint-copy"
              title={t('settings.openApiCopyEndpointHint')}
              onClick={() => triggerCopy('passportUrl', passportUrl)}
            >
              <code>{passportUrl}</code>
              {copied === 'passportUrl' ? <RiCheckLine size={13} aria-hidden="true" /> : <RiFileCopyLine size={13} aria-hidden="true" />}
              {copied === 'passportUrl' ? <span>{t('settings.openApiCopied')}</span> : null}
            </button>
          </div>
          <small className="xmimo-tts-open-api-note">
            {t(passportListening ? 'settings.passportApiListeningHint' : 'settings.passportApiStoppedHint')}
          </small>
        </div>
        <div className="xmimo-tts-open-api-side">
          <div className="xmimo-tts-open-api-copy-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              title={t('settings.openApiCopyHttpConfigHint')}
              onClick={() => triggerPassportCopy('passportConfig', token => buildPassportSynthesizeHttpConfig(passportUrl, passportLan, token))}
            >
              {copied === 'passportConfig' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiLink size={14} aria-hidden="true" />}
              <span>{t(copied === 'passportConfig' ? 'settings.openApiCopied' : 'settings.openApiCopyHttpConfig')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => triggerPassportCopy('passportCurl', token => buildPassportSynthesizeCurl(passportUrl, token))}
            >
              {copied === 'passportCurl' ? <RiCheckLine size={14} aria-hidden="true" /> : <RiTerminalBoxLine size={14} aria-hidden="true" />}
              <span>{t(copied === 'passportCurl' ? 'settings.openApiCopied' : 'settings.openApiCopySnippet')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('settings.passportApiRefresh')}
              title={t('settings.passportApiRefresh')}
              disabled={passportPhase === 'loading'}
              onClick={() => setPassportRefresh(v => v + 1)}
            >
              <RiRefreshLine size={14} aria-hidden="true" />
              <span>{t('settings.passportApiRefresh')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
    {copied === 'failed' ? <small className="xmimo-tts-failed" role="alert">{t('settings.openApiCopyFailed')}</small> : null}
  </section>
}
