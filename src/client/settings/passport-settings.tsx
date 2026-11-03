import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_PASSPORT_SETTINGS, PASSPORT_NUMBER_FIELDS, PASSPORT_STATUS_ROUTE } from '../../types/passport.js'
import type { PassportNumberField, PassportSettings } from '../../types/passport.js'
import type { PassportConnectionStatus } from '../../types/passport.js'
import { IDLE_PLUGIN_CHANGES } from '../plugin-activity.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { LocaleKey, Translate } from '../localization.js'
import { savePassportDraft, validatePassportDraft } from './passport-draft.js'
import { useSettingsSnapshot } from './scope.js'
import { hostRoute } from '../host-route.js'

interface Props extends PluginConfigViewProps {
  scope: ConfigForm<PassportSettings>
  t: Translate
  changes?: SnapshotSource<boolean>
  tokenConfigured?: SnapshotSource<boolean>
  guideHref?: string
  connectionStatus?: PassportConnectionStatus
}

const GROUPS = [
  { id: 'connection', fields: ['host', 'port', 'accessToken', 'deviceId'] },
  { id: 'session', fields: ['agentPreset', 'cwd'] },
  { id: 'capture', fields: ['silenceMs', 'minSpeechMs', 'speechThreshold', 'maxRecordingSeconds'] },
  { id: 'limits', fields: ['maxReplySeconds', 'requestTimeoutMs'] },
] as const

interface Draft { base: PassportSettings; value: PassportSettings; revision: number }

export function PassportSettingsPage(props: Props): ReactElement {
  if (props.view === 'summary') return <>{props.t('passport.description')}</>
  return <PassportForm {...props} />
}

function PassportForm({ scope, t, changes = IDLE_PLUGIN_CHANGES, tokenConfigured, connectionStatus, guideHref = 'https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts/#passport' }: Props): ReactElement {
  const id = useId()
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const source = tokenConfigured ?? IDLE_PLUGIN_CHANGES
  const savedToken = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const [liveToken, setLiveToken] = useState<{ scope: ConfigForm<PassportSettings> | null; configured: boolean }>({ scope: null, configured: false })
  const [connection, setConnection] = useState<PassportConnectionStatus | undefined>(undefined)
  const [copied, setCopied] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const hasToken = savedToken || (liveToken.scope === scope && liveToken.configured) || !!snapshot.value?.accessToken
  useEffect(() => {
    if (tokenConfigured || snapshot.status !== 'ready' || changing) return
    const request = new AbortController(), revision = snapshot.revision
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch(hostRoute(PASSPORT_STATUS_ROUTE), { cache: 'no-store', credentials: 'same-origin', signal: request.signal })
        if (!response.ok) throw new Error('passport-status-unavailable')
        const value = await response.json() as PassportConnectionStatus
        if (!request.signal.aborted && scope.getSnapshot().revision === revision && typeof value.configured === 'boolean') {
          setLiveToken({ scope, configured: value.configured })
          setConnection(value)
        }
      } catch {}
      if (!request.signal.aborted) timer = setTimeout(() => { void refresh() }, 2500)
    }
    void refresh()
    return () => { request.abort(); clearTimeout(timer) }
  }, [scope, tokenConfigured, snapshot.status, snapshot.revision, changing])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const accepted = { ...DEFAULT_PASSPORT_SETTINGS, ...snapshot.value, accessToken: snapshot.value?.accessToken ?? '' }
  const value = draft?.value ?? accepted
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || changing || state === 'saving'
  const dirty = draft !== null && Object.keys(DEFAULT_PASSPORT_SETTINGS).some(field => draft.base[field as keyof PassportSettings] !== value[field as keyof PassportSettings])
  const conflict = draft !== null && draft.revision !== snapshot.revision
  const invalid = validatePassportDraft(value, hasToken)
  const edit = (field: keyof PassportSettings, next: string | number): void => {
    if (disabled || snapshot.revision === undefined) return
    const revision = snapshot.revision
    setDraft(previous => ({ base: previous?.base ?? accepted, revision: previous?.revision ?? revision, value: { ...(previous?.value ?? accepted), [field]: next } }))
    setState('idle')
  }
  const save = async (): Promise<void> => {
    if (!draft || disabled || !dirty || conflict || invalid) return
    setState('saving')
    try {
      await savePassportDraft(scope, draft.base, draft.value, draft.revision, hasToken)
      if (draft.value.accessToken) setLiveToken({ scope, configured: true })
      setDraft(null)
      setState('saved')
    } catch { setState('failed') }
  }
  const quickConnect = async (): Promise<void> => {
    if (disabled || conflict || snapshot.revision === undefined) return
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 10000).padStart(4, '0')
    const next = { ...value, host: '0.0.0.0', accessToken: code }
    setState('saving')
    try {
      await savePassportDraft(scope, draft?.base ?? accepted, next, draft?.revision ?? snapshot.revision, hasToken)
      setDraft(null)
      setLiveToken({ scope, configured: true })
      setPairingCode(code)
      setState('saved')
    } catch { setState('failed') }
  }
  const status = connectionStatus ?? connection
  const statusKey = status?.error === 'passport-port-in-use' ? 'passport.portInUse'
    : status?.error ? 'passport.listenFailed' : !status ? 'passport.statusLoading'
      : typeof status.servicesReady !== 'boolean' ? 'passport.reloadRequired'
      : !status.servicesReady ? 'passport.servicesWaiting'
        : !status.listening ? 'passport.notListening'
          : ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(status.host) ? 'passport.localOnly'
            : !status.recognitionReady ? 'passport.asrWaiting'
              : status.connected ? 'passport.deviceConnected' : 'passport.deviceWaiting'

  if (snapshot.status !== 'ready') return <p role="status">{t(snapshot.status === 'loading' ? 'passport.loading' : 'passport.unavailable')}</p>
  return <form className="xmimo-ui-scope xmimo-qq-settings xmimo-passport-settings" aria-label={t('passport.title')} onSubmit={event => { event.preventDefault(); void save() }}>
    <header className="xmimo-passport-intro">
      <p>{t('passport.requirements')}</p>
      <a href={guideHref} target={guideHref.startsWith('#') ? undefined : '_blank'} rel={guideHref.startsWith('#') ? undefined : 'noopener noreferrer'}>{t('passport.guide')}</a>
    </header>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <section className="xmimo-passport-quick" aria-labelledby={`${id}-quick`}>
      <h4 id={`${id}-quick`}>{t('passport.quickTitle')}</h4>
      <p>{t('passport.quickHint')}</p>
      <Button type="button" variant="primary" size="sm" disabled={disabled || conflict} onClick={() => { void quickConnect() }}>{t(state === 'saving' ? 'settings.saving' : 'passport.quickEnable')}</Button>
      {pairingCode ? <p>{t('passport.pairingCode')} <strong className="xmimo-passport-code">{pairingCode}</strong></p> : null}
      <p role="status">{t(statusKey)}{status?.listening ? ` · ${t('passport.port')} ${status.port}` : ''}</p>
      <p>{t('passport.deviceAddress')}</p>
      {status?.addresses?.length ? <ul className="xmimo-passport-addresses">{status.addresses.map(item => <li key={item.address}>
        <strong>{item.address}</strong><span>{item.name}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          if (!navigator.clipboard) { setCopied('failed'); return }
          void navigator.clipboard.writeText(item.address).then(() => setCopied(item.address), () => setCopied('failed'))
        }}>{t(copied === item.address ? 'passport.copied' : 'passport.copyAddress')}</Button>
      </li>)}</ul> : <p className="xmimo-qq-hint">{t('passport.addressUnavailable')}</p>}
      {copied === 'failed' ? <p role="status">{t('passport.copyFailed')}</p> : null}
      <ol><li>{t('passport.stepHost')}</li><li>{t('passport.stepDevice')}</li><li>{t('passport.stepTalk')}</li></ol>
      <p className="xmimo-qq-hint">{t('passport.devScope')}</p>
    </section>
    <details className="xmimo-passport-advanced"><summary>{t('passport.advanced')}</summary>
    {GROUPS.map(group => <section key={group.id} aria-labelledby={`${id}-${group.id}`}>
      <h4 id={`${id}-${group.id}`}>{t(`passport.${group.id}`)}</h4>
      <p className="xmimo-qq-hint">{t(`passport.${group.id}Hint`)}</p>
      <div className="xmimo-qq-grid">
        {group.fields.map(field => {
          const numeric = field in PASSPORT_NUMBER_FIELDS
          const range = numeric ? PASSPORT_NUMBER_FIELDS[field as PassportNumberField] : undefined
          const fieldId = `${id}-${field}`
          return <label className="xmimo-qq-field" key={field} htmlFor={fieldId}>
            <span>{t(`passport.${field}`)}</span>
            <input id={fieldId} name={field} type={numeric ? 'number' : field === 'accessToken' ? 'password' : 'text'}
              autoComplete="off" spellCheck={false} disabled={disabled} required={field === 'host' || (field === 'accessToken' && !hasToken)}
              min={range?.min} max={range?.max} step={range?.step} minLength={field === 'accessToken' ? 4 : undefined} maxLength={field === 'accessToken' ? 192 : undefined}
              placeholder={field === 'accessToken' && hasToken ? t('passport.tokenSaved') : undefined}
              aria-describedby={`${fieldId}-hint`} aria-invalid={dirty && invalid === field ? true : undefined}
              value={typeof value[field] === 'number' && Number.isNaN(value[field]) ? '' : value[field]}
              onChange={event => edit(field, numeric ? event.currentTarget.valueAsNumber : event.currentTarget.value)} />
            <small id={`${fieldId}-hint`}>{t(`passport.${field}Hint` as LocaleKey)}</small>
          </label>
        })}
      </div>
      {group.id === 'connection' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(value.host) ? <p className="xmimo-qq-hint" role="note">{t('passport.loopback')}</p> : null}
    </section>)}
    </details>
    <p className="xmimo-qq-hint">{t('passport.savedHint')}</p>
    <div className="xmimo-tts-card-footer xmimo-qq-footer"><div className="xmimo-tts-card-actions">
      <span role="status">{!snapshot.writable ? t('settings.readOnly') : conflict ? t('whale.conflict')
        : dirty && invalid ? `${t('passport.error')}${t(`passport.${invalid}`)}` : state === 'failed' ? t('settings.failed') : state === 'saved' && !dirty ? t('settings.saved') : ''}</span>
      <div className="xmimo-tts-card-action-buttons">
        <Button type="button" variant="outline" size="sm" disabled={!draft || state === 'saving'} onClick={() => { setDraft(null); setState('idle') }}>{t('settings.discard')}</Button>
        <Button type="submit" variant="primary" size="sm" disabled={disabled || !dirty || conflict || invalid !== null}>{t(state === 'saving' ? 'settings.saving' : 'settings.save')}</Button>
      </div>
    </div></div>
  </form>
}
