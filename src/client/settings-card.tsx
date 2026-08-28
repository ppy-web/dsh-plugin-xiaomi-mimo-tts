import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  TTS_MODELS,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_UNINSTALL_ROUTE,
  TTS_VOICES,
  isSupportedTtsApiKey,
  resolveTtsSettings,
} from '../shared.js'
import type { TtsFormat, TtsSettings } from '../shared.js'
import type { Translate } from './localization.js'
import { isRecord, useSettingsSnapshot } from './settings-scope.js'
import {
  CUSTOM_VOICE_DESIGN_OPTION,
  VoiceDesignPresetPicker,
  isPresetVoiceDesignPrompt,
} from './voice-design-picker.js'

interface SettingsCardProps {
  scope: SettingsScope<TtsSettings>
  t: Translate
}

type EditableSettingField = 'enabled' | 'autoPlay' | 'model' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'format'
type SettingField = EditableSettingField | 'apiKey'
type DraftChange = { kind: 'set' } | { kind: 'clear' }
type DraftChanges = Partial<Record<SettingField, DraftChange>>
type ResolvedSettings = ReturnType<typeof resolveTtsSettings>
type DraftSettings = Pick<ResolvedSettings, EditableSettingField>

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'model', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'format']


function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

interface SettingFieldHeadingProps {
  label: string
  suffix?: ReactElement
  overriddenLabel: string
  resetLabel?: string
  overridden: boolean
  resettable: boolean
  disabled: boolean
  onReset?: () => void
}

function SettingFieldHeading({ label, suffix, overriddenLabel, resetLabel, overridden, resettable, disabled, onReset }: SettingFieldHeadingProps): ReactElement {
  return (
    <span className="xmimo-tts-field-heading">
      <span className="xmimo-tts-field-label">
        <span>{label}</span>
        {suffix}
      </span>
      {overridden ? <span className="xmimo-tts-field-badges">
        <small className="xmimo-tts-overridden">{overriddenLabel}</small>
        {resettable && onReset !== undefined && resetLabel !== undefined ? <button type="button" className="xmimo-tts-reset" disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset() }}>{resetLabel}</button> : null}
      </span> : null}
    </span>
  )
}

export function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [model, setModel] = useState(initial.model)
  const [voice, setVoice] = useState(initial.voice)
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState(initial.voiceDesignPrompt)
  const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = useState(initial.voiceDesignCustomPrompt)
  const [format, setFormat] = useState<TtsFormat>(initial.format)
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [uninstallState, setUninstallState] = useState<'idle' | 'confirming' | 'uninstalling' | 'uninstalled' | 'failed'>('idle')
  const [open, setOpen] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'loading' | 'missing' | 'supported' | 'unsupported'>('loading')

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, model, voice, voiceDesignPrompt, voiceDesignCustomPrompt, format }
  const acceptedValue = (field: EditableSettingField): ResolvedSettings[typeof field] => {
    const raw = value?.[field]
    return (raw === undefined ? accepted[field] : raw) as ResolvedSettings[typeof field]
  }
  const hasOverride = (field: SettingField): boolean => hasLayerField(snapshot.user, field)
  const fieldOverridden = (field: SettingField): boolean => {
    const change = changes[field]
    if (change?.kind === 'clear') return false
    if (change?.kind === 'set') return field === 'apiKey' ? apiKey.trim().length > 0 : true
    return hasOverride(field)
  }
  const fieldDirty = (field: EditableSettingField): boolean => {
    const change = changes[field]
    if (change === undefined) return false
    if (change.kind === 'clear') return hasOverride(field)
    return !Object.is(draft[field], acceptedValue(field))
  }
  const apiKeyDirty = changes.apiKey?.kind === 'clear'
    ? hasOverride('apiKey')
    : changes.apiKey?.kind === 'set' && apiKey.trim().length > 0
  const dirty = EDITABLE_SETTING_FIELDS.some(fieldDirty) || apiKeyDirty === true
  const enteredApiKey = apiKey.trim()
  const apiKeyWarning = enteredApiKey.length > 0
    ? !isSupportedTtsApiKey(enteredApiKey)
    : apiKeyStatus === 'missing' || apiKeyStatus === 'unsupported'
  const apiKeyMessage = enteredApiKey.length > 0
    ? isSupportedTtsApiKey(enteredApiKey) ? t('settings.apiKeyStatus') : t('settings.apiKeyUnsupported')
    : apiKeyStatus === 'missing'
      ? t('settings.apiKeyMissing')
      : apiKeyStatus === 'unsupported'
        ? t('settings.apiKeyUnsupported')
        : t('settings.apiKeyStatus')

  useEffect(() => {
    if (snapshot.status === 'unavailable') return
    let active = true
    setApiKeyStatus('loading')
    void fetch(TTS_API_KEY_STATUS_ROUTE, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('api-key-status-failed')
        return await response.json() as { configured?: unknown; supported?: unknown }
      })
      .then((status) => {
        if (!active) return
        setApiKeyStatus(status.configured !== true ? 'missing' : status.supported === true ? 'supported' : 'unsupported')
      })
      .catch(() => {
        if (active) setApiKeyStatus('missing')
      })
    return () => { active = false }
  }, [snapshot.status, value])

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setFormat(next.format)
    setChanges({})
  }, [dirty, value])

  if (snapshot.status === 'unavailable') return null

  const markChange = (field: SettingField, kind: DraftChange['kind'] = 'set'): void => {
    setChanges((current) => ({ ...current, [field]: { kind } }))
    setState('idle')
  }

  const resetField = (field: EditableSettingField): void => {
    markChange(field, 'clear')
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'model') setModel(base.model)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'voiceDesignPrompt') setVoiceDesignPrompt(base.voiceDesignPrompt)
    if (field === 'voiceDesignCustomPrompt') setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt)
    if (field === 'format') setFormat(base.format)
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setFormat(next.format)
    setApiKey('')
    setChanges({})
    setState('idle')
  }

  const save = async (): Promise<void> => {
    setState('saving')
    try {
      for (const field of EDITABLE_SETTING_FIELDS) {
        const change = changes[field]
        if (change === undefined) continue
        if (change.kind === 'clear') {
          if (hasOverride(field)) await scope.unset(field)
        } else if (!Object.is(draft[field], acceptedValue(field))) {
          await scope.set(field, draft[field])
        }
      }
      const apiKeyChange = changes.apiKey
      if (apiKeyChange?.kind === 'clear') {
        if (hasOverride('apiKey')) await scope.unset('apiKey')
      } else if (apiKeyChange?.kind === 'set' && apiKey.trim().length > 0) {
        await scope.set('apiKey', apiKey.trim())
      }
      setApiKey('')
      setChanges({})
      setState('saved')
    } catch {
      setState('failed')
    }
  }

  const uninstall = async (): Promise<void> => {
    setUninstallState('uninstalling')
    try {
      const response = await fetch(TTS_UNINSTALL_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const result = await response.json() as { ok?: unknown }
      if (!response.ok || result.ok !== true) throw new Error('plugin-uninstall-failed')
      setUninstallState('uninstalled')
    } catch {
      setUninstallState('failed')
    }
  }

  return (
    <li className={open ? 'xmimo-tts-card xmimo-tts-card-open' : 'xmimo-tts-card'}>
      <button
        type="button"
        className="xmimo-tts-card-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${t('settings.title')}`}
        onClick={() => { setOpen((current) => !current) }}
      >
        <span className="xmimo-tts-card-head-text">
          <span className="xmimo-tts-card-title">{t('settings.title')}</span>
          <span className="xmimo-tts-card-description">{t('settings.description')}</span>
        </span>
        {dirty ? <span className="xmimo-tts-pending" role="status">{t('settings.unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? 'xmimo-tts-chevron xmimo-tts-chevron-open' : 'xmimo-tts-chevron'} />
      </button>
      {open ? <div className="xmimo-tts-card-body">
        <div className="xmimo-tts-grid">
        <div className="xmimo-tts-api-key xmimo-tts-wide">
          <SettingFieldHeading
            label={t('settings.apiKey')}
            suffix={<a className="xmimo-tts-api-key-link" href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer">{t('settings.getApiKey')}</a>}
            overriddenLabel={t('settings.apiKeyConfigured')}
            overridden={fieldOverridden('apiKey')}
            resettable={false}
            disabled={!snapshot.writable}
          />
          <input
            type="password"
            value={apiKey}
            name="xmimo-tts-api-key"
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="none"
            data-1p-ignore="true"
            data-bwignore="true"
            data-lpignore="true"
            placeholder={t('settings.secretPlaceholder')}
            disabled={!snapshot.writable}
            onChange={(event) => { setApiKey(event.target.value); markChange('apiKey') }}
          />
          <small className={apiKeyWarning ? 'xmimo-tts-api-key-warning' : undefined} role={apiKeyWarning ? 'alert' : undefined}>
            {apiKeyMessage}
          </small>
        </div>
        <div className="xmimo-tts-switch-row xmimo-tts-wide">
          <label className="xmimo-tts-checkbox-row">
            <span className="xmimo-tts-switch-copy">
              <SettingFieldHeading label={t('settings.enabled')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('enabled') }} />
            </span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!snapshot.writable}
              onChange={(event) => {
                const next = event.target.checked
                setEnabled(next)
                if (!next) {
                  setAutoPlay(false)
                  setChanges((current) => ({ ...current, enabled: { kind: 'set' }, autoPlay: { kind: 'set' } }))
                } else markChange('enabled')
                setState('idle')
              }}
            />
            <span className="xmimo-tts-switch-control" aria-hidden="true" />
          </label>
          <label className="xmimo-tts-checkbox-row">
            <span className="xmimo-tts-switch-copy">
              <SettingFieldHeading label={t('settings.autoPlay')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('autoPlay') }} />
            </span>
            <input
              type="checkbox"
              checked={enabled && autoPlay}
              disabled={!snapshot.writable}
              onChange={(event) => {
                const next = event.target.checked
                setAutoPlay(next)
                if (next) {
                  setEnabled(true)
                  setChanges((current) => ({ ...current, autoPlay: { kind: 'set' }, enabled: { kind: 'set' } }))
                } else markChange('autoPlay')
                setState('idle')
              }}
            />
            <span className="xmimo-tts-switch-control" aria-hidden="true" />
          </label>
        </div>
        <div className="xmimo-tts-model xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('model')} resettable disabled={!snapshot.writable} onReset={() => { resetField('model') }} />
          <select value={model} disabled={!snapshot.writable} onChange={(event) => { setModel(event.target.value as typeof TTS_MODELS[number]); markChange('model') }}>
            <option value="mimo-v2.5-tts">{t('settings.presetModel')}</option>
            <option value="mimo-v2.5-tts-voicedesign">{t('settings.voiceDesignModel')}</option>
          </select>
          {enabled && autoPlay ? <small>{t(model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
        </div>
        {model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.voiceDesignPrompt')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceDesignPrompt')} resettable disabled={!snapshot.writable} onReset={() => { resetField('voiceDesignPrompt') }} />
          <VoiceDesignPresetPicker
            value={isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION}
            disabled={!snapshot.writable}
            label={t('settings.voiceDesignPrompt')}
            customLabel={t('settings.customVoiceOption')}
            customSummary={t('settings.customVoiceSummary')}
            onChange={(value) => {
              const next = value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value
              setVoiceDesignPrompt(next)
              markChange('voiceDesignPrompt')
            }}
          />
          <textarea
            value={voiceDesignPrompt}
            rows={4}
            disabled={!snapshot.writable}
            placeholder={t('settings.voiceDesignPromptHint')}
            onChange={(event) => {
              const next = event.target.value
              setVoiceDesignPrompt(next)
              setVoiceDesignCustomPrompt(next)
              setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
              setState('idle')
            }}
          />
          <small>{t('settings.voiceDesignPromptHint')}</small>
        </div> : null}
        {model === 'mimo-v2.5-tts' ? <div className="xmimo-tts-select-column xmimo-tts-wide">
          <div>
            <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('voice') }} />
            <select value={voice} disabled={!snapshot.writable} onChange={(event) => { setVoice(event.target.value); markChange('voice') }}>
              {TTS_VOICES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <SettingFieldHeading label={t('settings.format')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('format') }} />
            <select value={format} disabled={!snapshot.writable} onChange={(event) => { setFormat(event.target.value as 'mp3' | 'wav'); markChange('format') }}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
          </div>
        </div> : null}
        </div>
        <div className="xmimo-tts-card-actions">
          {uninstallState === 'confirming'
            ? (
              <span className="xmimo-tts-uninstall-confirmation">
                <span>{t('settings.uninstallQuestion')}</span>
                <span className="xmimo-tts-uninstall-choice">
                  <button type="button" onClick={() => { void uninstall() }}>{t('settings.uninstallConfirm')}</button>
                  <button type="button" onClick={() => { setUninstallState('idle') }}>{t('settings.uninstallCancel')}</button>
                </span>
              </span>
              )
            : (
              <button
                type="button"
                className="xmimo-tts-uninstall"
                disabled={uninstallState === 'uninstalling' || uninstallState === 'uninstalled'}
                onClick={() => { setUninstallState('confirming') }}
              >
                {uninstallState === 'uninstalling' ? t('settings.uninstalling') : t('settings.uninstall')}
              </button>
              )}
          <a
            className="xmimo-tts-star"
            href="https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('settings.star')}
          </a>
          {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
          {uninstallState === 'uninstalled' ? <span role="status">{t('settings.uninstalled')}</span> : null}
          {uninstallState === 'failed' ? <span className="xmimo-tts-failed" role="status">{t('settings.uninstallFailed')}</span> : null}
          {state === 'saved' && !dirty ? <span role="status">{t('settings.saved')}</span> : null}
          {state === 'failed' ? <span className="xmimo-tts-failed" role="status">{t('settings.failed')}</span> : null}
          <button type="button" className="xmimo-tts-discard" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={discard}>
            {t('settings.discard')}
          </button>
          <button type="button" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={() => { void save() }}>
            {state === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div> : null}
    </li>
  )
}
