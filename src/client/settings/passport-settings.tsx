import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { FiLink, FiCopy, FiCheck, FiRefreshCw, FiKey, FiWifi } from 'react-icons/fi'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'
import { DEFAULT_PASSPORT_SETTINGS, PASSPORT_NUMBER_FIELDS, PASSPORT_STATUS_ROUTE, PASSPORT_PRESETS_ROUTE, PASSPORT_DEVICE_ASSET_ROUTE, PASSPORT_SCREEN_ASSET_ROUTE } from '../../types/passport.js'
import type { PassportNumberField, PassportSettings } from '../../types/passport.js'
import type { PassportConnectionStatus, PassportPreset } from '../../types/passport.js'
import { IDLE_PLUGIN_CHANGES } from '../plugin-activity.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { LocaleKey, Translate } from '../localization.js'
import { savePassportDraft, validatePassportDraft, refreshPassportSession, generatePassportPairingCode } from './passport-draft.js'
import { useSettingsSnapshot } from './scope.js'
import { hostRoute } from '../host-route.js'
import { PASSPORT_PRESET_PROMPT } from './passport-prompt.js'
import { copyText } from './copy-text.js'
import { passportAsrTestError, requestPassportAsrTest } from './passport-asr-test.js'
import type { PassportAsrTestFailure } from './passport-asr-test.js'

interface Props extends PluginConfigViewProps {
  scope: ConfigForm<PassportSettings>
  ttsScope: ConfigForm<TtsSettings>
  t: Translate
  changes?: SnapshotSource<boolean>
  tokenConfigured?: SnapshotSource<boolean>
  guideHref?: string
  connectionStatus?: PassportConnectionStatus
  presets?: PassportPreset[]
  openTtsSettings?: () => void
}

const GROUPS = [
  { id: 'connection', fields: ['host', 'port', 'accessToken', 'deviceId'] },
  { id: 'workspace', fields: ['cwd'] },
  { id: 'capture', fields: ['silenceMs', 'minSpeechMs', 'speechThreshold', 'maxRecordingSeconds'] },
  { id: 'limits', fields: ['maxReplySeconds', 'requestTimeoutMs'] },
] as const

interface Draft { base: PassportSettings; value: PassportSettings; revision: number }

export function PassportSettingsPage(props: Props): ReactElement {
  if (props.view === 'summary') return <>{props.t('passport.description')}</>
  return <PassportForm {...props} />
}

function PassportForm({ scope, ttsScope, t, changes = IDLE_PLUGIN_CHANGES, tokenConfigured, connectionStatus, presets, openTtsSettings, guideHref = 'https://ppy-web.github.io/dsh-plugin-xiaomi-mimo-tts/#passport' }: Props): ReactElement {
  const id = useId()
  const snapshot = useSettingsSnapshot(scope)
  const ttsSnapshot = useSettingsSnapshot(ttsScope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const source = tokenConfigured ?? IDLE_PLUGIN_CHANGES
  const savedToken = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const [liveToken, setLiveToken] = useState<{ scope: ConfigForm<PassportSettings> | null; configured: boolean }>({ scope: null, configured: false })
  const [connection, setConnection] = useState<PassportConnectionStatus | undefined>(undefined)
  const [copied, setCopied] = useState('')
  const testRequest = useRef<AbortController | null>(null)
  const [asrTest, setAsrTest] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [asrTestError, setAsrTestError] = useState<PassportAsrTestFailure | null>(null)
  useEffect(() => () => { testRequest.current?.abort() }, [])
  const [promptCopy, setPromptCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [pairingCode, setPairingCode] = useState('')
  const [roster, setRoster] = useState<PassportPreset[] | undefined>(presets)
  const [rosterFailed, setRosterFailed] = useState(false)
  const [rosterVersion, setRosterVersion] = useState(0)
  useEffect(() => {
    if (presets) { setRoster(presets); return }
    if (snapshot.status !== 'ready' || changing) return
    const request = new AbortController()
    setRoster(undefined); setRosterFailed(false)
    void fetch(hostRoute(PASSPORT_PRESETS_ROUTE), { cache: 'no-store', credentials: 'same-origin', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw new Error('passport-preset-unavailable')
        const value = await response.json() as { presets: PassportPreset[] }
        if (!Array.isArray(value.presets) || value.presets.some(item => typeof item.id !== 'string')) throw new Error('passport-preset-unavailable')
        if (!request.signal.aborted) setRoster(value.presets)
      }).catch(() => { if (!request.signal.aborted) setRosterFailed(true) })
    return () => request.abort()
  }, [presets, snapshot.status, changing, rosterVersion])
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
      } catch { if (!request.signal.aborted) setConnection(undefined) }
      if (!request.signal.aborted) timer = setTimeout(() => { void refresh() }, 1000)
    }
    void refresh()
    return () => { request.abort(); clearTimeout(timer) }
  }, [scope, tokenConfigured, snapshot.status, snapshot.revision, changing])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'renewed' | 'failed'>('idle')
  const accepted = { ...DEFAULT_PASSPORT_SETTINGS, ...snapshot.value, accessToken: snapshot.value?.accessToken ?? '' }
  const value = draft?.value ?? accepted
  const recognitionEnabled = resolveTtsSettings(ttsSnapshot.value).voiceRecognitionService
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || changing || state === 'saving'
  const dirty = draft !== null && Object.keys(DEFAULT_PASSPORT_SETTINGS).some(field => draft.base[field as keyof PassportSettings] !== value[field as keyof PassportSettings])
  const conflict = draft !== null && draft.revision !== snapshot.revision
  const invalid = validatePassportDraft(value, hasToken)
  const knownPreset = !value.agentPreset || roster?.some(item => item.id === value.agentPreset && !item.unavailable)
  const edit = (field: keyof PassportSettings, next: string | number): void => {
    if (disabled || snapshot.revision === undefined) return
    const revision = snapshot.revision
    setDraft(previous => ({ base: previous?.base ?? accepted, revision: previous?.revision ?? revision, value: { ...(previous?.value ?? accepted), [field]: next } }))
    setState('idle')
    if (field === 'asrProvider') { testRequest.current?.abort(); testRequest.current = null; setAsrTest('idle'); setAsrTestError(null) }
  }
  useEffect(() => {
    if (recognitionEnabled || value.asrProvider === 'host') return
    testRequest.current?.abort(); testRequest.current = null
    setAsrTest('idle'); setAsrTestError(null)
  }, [recognitionEnabled, value.asrProvider])
  const testAsr = async (): Promise<void> => {
    if (testRequest.current) return
    const request = new AbortController()
    testRequest.current = request
    setAsrTest('testing')
    setAsrTestError(null)
    try {
      const error = await requestPassportAsrTest(value.asrProvider, request.signal)
      if (!request.signal.aborted) { setAsrTestError(error); setAsrTest(error ? 'failed' : 'success') }
    } catch { if (!request.signal.aborted) { setAsrTestError({ code: 'passport-asr-network-failed' }); setAsrTest('failed') } }
    finally { if (testRequest.current === request) testRequest.current = null }
  }
  const save = async (): Promise<void> => {
    if (!draft || disabled || !dirty || conflict || invalid) return
    setState('saving')
    try {
      await savePassportDraft(scope, draft.base, draft.value, draft.revision, hasToken)
      if (draft.value.accessToken !== draft.base.accessToken) setPairingCode(/^\d{4}$/u.test(draft.value.accessToken) ? draft.value.accessToken : '')
      if (draft.value.accessToken) setLiveToken({ scope, configured: true })
      setDraft(null)
      setState('saved')
    } catch { setState('failed') }
  }
  const quickConnect = async (): Promise<void> => {
    if (disabled || conflict || snapshot.revision === undefined) return
    const code = generatePassportPairingCode()
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
  const renewSession = async (): Promise<void> => {
    if (disabled || conflict || invalid || !roster || !knownPreset || snapshot.revision === undefined) return
    setState('saving')
    try {
      await refreshPassportSession(scope, draft?.base ?? accepted, value, draft?.revision ?? snapshot.revision, roster, hasToken)
      if (value.accessToken !== (draft?.base ?? accepted).accessToken) setPairingCode(/^\d{4}$/u.test(value.accessToken) ? value.accessToken : '')
      if (value.accessToken) setLiveToken({ scope, configured: true })
      setDraft(null); setState('renewed')
    } catch { setState('failed') }
  }
  const statusKey = status?.error === 'passport-port-in-use' ? 'passport.portInUse'
    : status?.error ? 'passport.listenFailed' : !status ? 'passport.statusLoading'
      : status.sessionError === 'passport-preset-changed' ? 'passport.presetChanged'
        : status.sessionError === 'passport-preset-unavailable' ? 'passport.presetUnavailable'
          : status.sessionError === 'passport-session-unavailable' ? 'passport.sessionFailed'
      : typeof status.servicesReady !== 'boolean' ? 'passport.reloadRequired'
      : !status.servicesReady ? 'passport.servicesWaiting'
        : status.asrProvider !== undefined && status.asrProvider !== 'host' && !recognitionEnabled ? 'passport.asrDisabledStatus'
        : !status.listening ? 'passport.notListening'
          : ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(status.host) ? 'passport.localOnly'
            : !status.recognitionReady ? 'passport.asrWaiting'
              : status.connected ? 'passport.deviceConnected' : 'passport.deviceWaiting'
  const statusTone = statusKey === 'passport.deviceConnected' ? 'connected'
    : statusKey === 'passport.deviceWaiting' ? 'waiting'
      : ['passport.statusLoading', 'passport.notListening'].includes(statusKey) ? 'idle' : 'warning'

  if (snapshot.status !== 'ready') return <p role="status">{t(snapshot.status === 'loading' ? 'passport.loading' : 'passport.unavailable')}</p>
  return <form className="xmimo-ui-scope xmimo-qq-settings xmimo-passport-settings" aria-label={t('passport.title')} onSubmit={event => { event.preventDefault(); void save() }}>
    <header className="xmimo-passport-intro">
      <p>{t('passport.requirements')}</p>
      <a href={guideHref} target={guideHref.startsWith('#') ? undefined : '_blank'} rel={guideHref.startsWith('#') ? undefined : 'noopener noreferrer'}>{t('passport.guide')}</a>
    </header>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <section className="xmimo-passport-quick" aria-labelledby={`${id}-quick`}>
      <div className="xmimo-passport-heading">
        <div><h4 id={`${id}-quick`}>{t('passport.quickTitle')}</h4><p className="xmimo-qq-hint">{t('passport.quickHint')}</p></div>
        <Button type="button" variant="primary" size="sm" disabled={disabled || conflict} onClick={() => { void quickConnect() }}>
          {pairingCode ? <FiRefreshCw aria-hidden="true" /> : <FiLink aria-hidden="true" />}
          {t(state === 'saving' ? 'settings.saving' : 'passport.quickEnable')}
        </Button>
      </div>
      <div className="xmimo-passport-overview">
        <figure className="xmimo-passport-device">
          <div className="xmimo-passport-device-art">
            <img src={hostRoute(PASSPORT_DEVICE_ASSET_ROUTE)} alt={t('passport.deviceDiagram')} />
            <img className="xmimo-passport-device-screen" src={hostRoute(PASSPORT_SCREEN_ASSET_ROUTE)} alt="" aria-hidden="true" />
            <div className="xmimo-passport-device-reply" aria-label={t('passport.replyText')}>
              <span>{t('passport.replyText')}</span>
              <p>{status?.connected && status.activity?.reply || t('passport.noReply')}</p>
            </div>
          </div>
          <div className="xmimo-passport-callout xmimo-passport-callout-power"><strong>{t('passport.powerButton')}</strong><span>{t('passport.powerHelp')}</span></div>
          <div className="xmimo-passport-callout xmimo-passport-callout-indicator"><strong>{t('passport.indicator')}</strong></div>
          <div className="xmimo-passport-callout xmimo-passport-callout-usb"><strong>{t('passport.usbPort')}</strong></div>
          <div className="xmimo-passport-callout xmimo-passport-callout-up"><strong>{t('passport.upButton')}</strong><span>{t('passport.upHelp')}</span></div>
          <div className="xmimo-passport-callout xmimo-passport-callout-down"><strong>{t('passport.downButton')}</strong><span>{t('passport.downHelp')}</span></div>
          <div className="xmimo-passport-callout xmimo-passport-callout-ok"><strong>{t('passport.okButton')}</strong><span>{t('passport.okHelp')}</span></div>
        </figure>
        <div className="xmimo-passport-live">
          <h4>{t('passport.liveStatus')}</h4>
          <div className="xmimo-passport-status" data-tone={statusTone} role="status">
            <span className="xmimo-passport-status-dot" aria-hidden="true" />
            <span>{t(statusKey)}</span>
          </div>
          <dl className="xmimo-passport-facts">
            <div><dt>{t('passport.microphone')}</dt><dd>{status?.connected && status.activity ? t(status.activity.microphone === 'open' ? 'passport.micOpen' : 'passport.micMuted') : t('passport.unknown')}</dd></div>
            <div><dt>{t('passport.activity')}</dt><dd>{status?.connected && status.activity ? t(`passport.phase.${status.activity.phase}`) : t('passport.unknown')}</dd></div>
            <div><dt>{t('passport.port')}</dt><dd>{status?.listening ? status.port : '—'}</dd></div>
          </dl>
          <div className="xmimo-passport-live-text"><h5>{t('passport.transcript')}</h5><p>{status?.connected && status.activity?.transcript || t('passport.noTranscript')}</p></div>
          <p className="xmimo-qq-hint xmimo-passport-live-hint">{t('passport.textHint')}</p>
        </div>
      </div>
      <div className="xmimo-passport-transfer">
      <div className="xmimo-passport-ip-field">
      <h4>{t('passport.computerIp')}</h4>
      <p className="xmimo-qq-hint">{t('passport.networkHint')}</p>
      {status?.addresses?.length ? <ul className="xmimo-passport-addresses">{status.addresses.map(item => <li key={item.address}>
        <div><strong>{item.address}</strong><span>{item.name}</span></div>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          if (!navigator.clipboard) { setCopied('failed'); return }
          void navigator.clipboard.writeText(item.address).then(() => setCopied(item.address), () => setCopied('failed'))
        }} aria-label={`${t(copied === item.address ? 'passport.copied' : 'passport.copyAddress')} ${item.address}`}>
          {copied === item.address ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
          {t(copied === item.address ? 'passport.copied' : 'passport.copyAddress')}</Button>
      </li>)}</ul> : <p className="xmimo-qq-hint">{t('passport.addressUnavailable')}</p>}
      {copied ? <span className="xmimo-passport-copy-feedback" role="status">{t(copied === 'failed' ? 'passport.copyFailed' : 'passport.copied')}</span> : null}
      </div>
      <div className="xmimo-passport-pair-field">
        <h4>{t('passport.codeLabel')}</h4>
        <p className="xmimo-qq-hint">{t(pairingCode ? 'passport.matchCode' : hasToken ? 'passport.codeSaved' : 'passport.codeEmpty')}</p>
        <div className="xmimo-passport-digits" aria-label={t('passport.codeLabel')}>
          {Array.from(pairingCode || '----', (digit, index) => <span key={index} aria-hidden="true">{digit === '-' ? '–' : digit}</span>)}
          <span className="xmimo-passport-sr-only">{pairingCode || t(hasToken ? 'passport.codeSaved' : 'passport.codeEmpty')}</span>
        </div>
        <p className="xmimo-qq-hint">{t('passport.devScope')}</p>
      </div>
      </div>
    </section>
    <div className="xmimo-passport-options">
    <section aria-labelledby={`${id}-preset`}>
      <h4 id={`${id}-preset`}>{t('passport.session')}</h4>
      <p className="xmimo-qq-hint xmimo-passport-section-hint">{t('passport.sessionHint')}</p>
      <div className="xmimo-qq-field">
        <label htmlFor={`${id}-agentPreset`}>{t('passport.agentPreset')}</label>
        <div className="xmimo-passport-control-row">
          <select id={`${id}-agentPreset`} name="agentPreset" disabled={disabled || !roster} value={value.agentPreset}
            aria-describedby={`${id}-preset-hint`} onChange={event => edit('agentPreset', event.currentTarget.value)}>
            <option value="">{t('passport.hostDefault')}</option>
            {value.agentPreset && !roster?.some(item => item.id === value.agentPreset) ? <option value={value.agentPreset} disabled>{value.agentPreset} — {t('passport.presetUnavailable')}</option> : null}
            {roster?.map(item => <option key={item.id} value={item.id} disabled={item.unavailable}>{item.name ? `${item.name} · ${item.id}` : item.id}{item.unavailable ? ` — ${t('passport.presetUnavailable')}` : ''}</option>)}
          </select>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={t('passport.reloadPresets')} title={t('passport.reloadPresets')}
            onClick={() => setRosterVersion(version => version + 1)}><FiRefreshCw aria-hidden="true" /></Button>
        </div>
        <small id={`${id}-preset-hint`}>{t('passport.agentPresetHint')}</small>
      </div>
      <div className="xmimo-passport-option-actions">
        <div className="xmimo-passport-prompt-action">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            void copyText(PASSPORT_PRESET_PROMPT).then(success => setPromptCopy(success ? 'copied' : 'failed'))
          }}><FiCopy aria-hidden="true" />{t('passport.copyPrompt')}</Button>
          <span>{t('passport.promptAfter')}</span>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || conflict || !!invalid || !roster || !knownPreset}
          onClick={() => { void renewSession() }}><FiRefreshCw aria-hidden="true" />{t(state === 'saving' ? 'settings.saving' : 'passport.newSession')}</Button>
      </div>
      <span className="xmimo-passport-option-feedback" role="status">{promptCopy === 'idle' ? '' : t(promptCopy === 'copied' ? 'passport.copied' : 'passport.promptCopyFailed')}</span>
      <p role="status" className="xmimo-qq-hint">{rosterFailed ? t('passport.presetsFailed') : !roster ? t('passport.presetsLoading')
        : !knownPreset ? t('passport.presetUnavailable') : state === 'renewed' ? t('passport.sessionRenewed') : ''}</p>
    </section>
    <section aria-labelledby={`${id}-recognition`}>
      <h4 id={`${id}-recognition`}>{t('passport.asrProvider')}</h4>
      <p className="xmimo-qq-hint xmimo-passport-section-hint">{t('passport.asrSectionHint')}</p>
      <div className="xmimo-qq-field">
        <label htmlFor={`${id}-asr`}>{t('passport.asrService')}</label>
        <select id={`${id}-asr`} name="asrProvider" value={value.asrProvider} disabled={disabled}
          aria-describedby={`${id}-asr-hint`} onChange={event => edit('asrProvider', event.currentTarget.value)}>
          {(['host', 'xiaomi', 'doubao', 'doubao-nostream'] as const).map(source => <option key={source} value={source}
            disabled={source !== 'host' && (!recognitionEnabled || !status?.recognitionChoices?.some(choice => choice.id === source && choice.configured))}>
            {t(`passport.asr.${source}`)}{source !== 'host' ? ` · ${t(!recognitionEnabled ? 'passport.asrDisabled' : status?.recognitionChoices?.some(choice => choice.id === source && choice.configured) ? 'passport.keyConfigured' : 'passport.keyMissing')}` : ''}
          </option>)}
        </select>
        <small id={`${id}-asr-hint`}>{t(value.asrProvider === 'host' ? 'passport.asrHostHint' : 'passport.asrCloudHint')}</small>
        <div className="xmimo-passport-option-actions">
          {openTtsSettings ? <Button type="button" variant="outline" size="sm" onClick={openTtsSettings}><FiKey aria-hidden="true" />{t('passport.configureKeys')}</Button> : null}
          <Button type="button" variant="outline" size="sm" disabled={changing || asrTest === 'testing' || (!recognitionEnabled && value.asrProvider !== 'host')} onClick={() => { void testAsr() }}><FiWifi aria-hidden="true" />{t(asrTest === 'testing' ? 'passport.asrTesting' : 'passport.asrTest')}</Button>
        </div>
        <small>{t('passport.asrTestHint')}</small>
        <small role="status">{asrTest === 'success' ? t('passport.asrTestSuccess') : asrTest === 'failed' && asrTestError ? passportAsrTestError(asrTestError, t) : ''}</small>
      </div>
    </section>
    </div>
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
