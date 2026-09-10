import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_API_KEY_STATUS_ROUTE,
  TTS_MIMO_LOGO_ASSET_ROUTE,
  TTS_UNINSTALL_ROUTE,
  TTS_UPDATE_ROUTE,
  isSupportedTtsApiKey,
  resolveTtsSettings,
  VOICE_DESIGN_AI_RPC_CHANNEL,
  VOICE_DESIGN_AI_RPC_ENDPOINT,
} from '../../shared.js'
import type { TtsFormat, TtsLocalSpeechMode, TtsModel, TtsSettings, TtsVoiceDesignPlaybackMode, VoiceDesignAiGeneratePayload, VoiceDesignAiGenerateResult } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { SettingsScopeCompat } from '../dsh-compat.js'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { PreviewStatus } from '../playback/preview-player.js'
import { isRecord, useSettingsSnapshot } from './scope.js'
import { ToggleSoundPlayer } from '../sound-effects/toggle-sound-player.js'
import type { SoundEffectsController } from '../sound-effects/types.js'
import { ApiKeyModule } from './api-key-module.js'
import { DetailsModule, VOICE_DESIGN_AI_COPY_KEYS } from './details-module.js'
import { PreviewModule } from './preview-module.js'
import { SoundEffectsPanel } from './sound-effects-module.js'
import { SwitchModule } from './switch-module.js'
import { hostRoute } from '../host-route.js'
import type { DraftChange, DraftChanges, EditableSettingField, ResolvedSettings, SettingField, SettingsValues } from './types.js'

interface SettingsCardProps {
  scope: SettingsScopeCompat<TtsSettings>
  t: Translate
  connection: { rpc: ClientConnectionRpc }
  controller: SoundEffectsController
}

type DraftSettings = SettingsValues

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'voiceVolume', 'model', 'localSpeechMode', 'localVoiceURI', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'format', 'voiceDesignPlaybackMode', 'soundEnabled', 'soundVolume', 'soundPack', 'taskSounds', 'clickSounds']
const RELEASES_URL = 'https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts/releases'

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

export function SettingsCard({ scope, t, connection, controller }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [voiceVolume, setVoiceVolume] = useState(initial.voiceVolume)
  const [model, setModel] = useState(initial.model)
  const [localSpeechMode, setLocalSpeechMode] = useState(initial.localSpeechMode)
  const [localVoiceURI, setLocalVoiceURI] = useState(initial.localVoiceURI)
  const [voice, setVoice] = useState(initial.voice)
  const [format, setFormat] = useState(initial.format)
  const [voiceDesignPlaybackMode, setVoiceDesignPlaybackMode] = useState(initial.voiceDesignPlaybackMode)
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState(initial.voiceDesignPrompt)
  const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = useState(initial.voiceDesignCustomPrompt)
  const [soundEnabled, setSoundEnabled] = useState(initial.soundEnabled)
  const [soundVolume, setSoundVolume] = useState(initial.soundVolume)
  const [soundPack, setSoundPack] = useState(initial.soundPack)
  const [taskSounds, setTaskSounds] = useState(initial.taskSounds)
  const [clickSounds, setClickSounds] = useState(initial.clickSounds)
  const [voiceDesignAiState, setVoiceDesignAiState] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle')
  const [voiceDesignAiCopyIndex, setVoiceDesignAiCopyIndex] = useState(() => Math.floor(Math.random() * VOICE_DESIGN_AI_COPY_KEYS.length))
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [uninstallState, setUninstallState] = useState<'idle' | 'confirming' | 'uninstalling' | 'uninstalled' | 'failed'>('idle')
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [previewText, setPreviewText] = useState(() => t('settings.previewDefaultText'))
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle')
  const [previewPlayer] = useState(() => new PreviewPlayer(setPreviewStatus))
  const [toggleSoundPlayer] = useState(() => new ToggleSoundPlayer())
  const [apiKeyStatus, setApiKeyStatus] = useState<'loading' | 'missing' | 'supported' | 'unsupported'>('loading')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, voiceVolume, model, localSpeechMode, localVoiceURI, voice, voiceDesignPrompt, voiceDesignCustomPrompt, format, voiceDesignPlaybackMode, soundEnabled, soundVolume, soundPack, taskSounds, clickSounds }
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
    if (!open) return
    let active = true
    void fetch(hostRoute(TTS_UPDATE_ROUTE), { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('version-check-failed')
        return await response.json() as { latestVersion?: unknown; updateAvailable?: unknown }
      })
      .then((result) => {
        if (!active) return
        setLatestVersion(result.updateAvailable === true && typeof result.latestVersion === 'string' ? result.latestVersion : null)
      })
      .catch(() => { if (active) setLatestVersion(null) })
    return () => { active = false }
  }, [open])

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setVoiceVolume(next.voiceVolume)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setFormat(next.format)
    setVoiceDesignPlaybackMode(next.voiceDesignPlaybackMode)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setSoundEnabled(next.soundEnabled)
    setSoundVolume(next.soundVolume)
    setSoundPack(next.soundPack)
    setTaskSounds(next.taskSounds)
    setClickSounds(next.clickSounds)
    setVoiceDesignAiState('idle')
    setChanges({})
  }, [dirty, value])

  useEffect(() => () => {
    toggleSoundPlayer.dispose()
    void previewPlayer.dispose()
  }, [previewPlayer, toggleSoundPlayer])

  useEffect(() => { previewPlayer.setVolume(voiceVolume); toggleSoundPlayer.setVolume(voiceVolume) }, [previewPlayer, toggleSoundPlayer, voiceVolume])

  if (snapshot.status === 'unavailable') return null

  const markChange = (field: SettingField, kind: DraftChange['kind'] = 'set'): void => {
    setChanges((current) => ({ ...current, [field]: { kind } }))
    setState('idle')
  }

  const generateVoiceDesign = async (): Promise<void> => {
    if (voiceDesignAiState === 'loading' || !snapshot.writable) return
    setVoiceDesignAiState('loading')
    try {
      const payload: VoiceDesignAiGeneratePayload = { input: voiceDesignPrompt }
      const raw = await connection.rpc.call(VOICE_DESIGN_AI_RPC_CHANNEL, VOICE_DESIGN_AI_RPC_ENDPOINT, payload)
      const result = raw as unknown as { ok: true; value: VoiceDesignAiGenerateResult } | { ok: false; error?: { message?: unknown } }
      if (!result.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : 'voice-design-ai-failed')
      const generated = result.value?.text
      if (typeof generated !== 'string' || generated.trim().length === 0) throw new Error('voice-design-ai-empty-output')
      setVoiceDesignPrompt(generated)
      setVoiceDesignCustomPrompt(generated)
      setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
      setState('idle')
      setVoiceDesignAiState('success')
    } catch {
      setVoiceDesignAiState('failed')
    }
  }

  const chooseVoiceDesignAiCopy = (): void => {
    setVoiceDesignAiCopyIndex((current) => (current + 1 + Math.floor(Math.random() * (VOICE_DESIGN_AI_COPY_KEYS.length - 1))) % VOICE_DESIGN_AI_COPY_KEYS.length)
  }

  const resetField = (field: EditableSettingField): void => {
    markChange(field, 'clear')
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'voiceVolume') setVoiceVolume(base.voiceVolume)
    if (field === 'model') setModel(base.model)
    if (field === 'localSpeechMode') setLocalSpeechMode(base.localSpeechMode)
    if (field === 'localVoiceURI') setLocalVoiceURI(base.localVoiceURI)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'format') setFormat(base.format)
    if (field === 'voiceDesignPlaybackMode') setVoiceDesignPlaybackMode(base.voiceDesignPlaybackMode)
    if (field === 'voiceDesignPrompt') { setVoiceDesignPrompt(base.voiceDesignPrompt); setVoiceDesignAiState('idle') }
    if (field === 'voiceDesignCustomPrompt') { setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt); setVoiceDesignAiState('idle') }
    if (field === 'soundEnabled') setSoundEnabled(base.soundEnabled)
    if (field === 'soundVolume') setSoundVolume(base.soundVolume)
    if (field === 'soundPack') setSoundPack(base.soundPack)
    if (field === 'taskSounds') setTaskSounds(base.taskSounds)
    if (field === 'clickSounds') setClickSounds(base.clickSounds)
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setVoiceVolume(next.voiceVolume)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setFormat(next.format)
    setVoiceDesignPlaybackMode(next.voiceDesignPlaybackMode)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setSoundEnabled(next.soundEnabled)
    setSoundVolume(next.soundVolume)
    setSoundPack(next.soundPack)
    setTaskSounds(next.taskSounds)
    setClickSounds(next.clickSounds)
    setVoiceDesignAiState('idle')
    setApiKey('')
    setChanges({})
    setState('idle')
  }

  const save = async (): Promise<void> => {
    setDetailsOpen(false)
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
      const response = await fetch(hostRoute(TTS_UNINSTALL_ROUTE), {
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

  const previewBusy = previewStatus === 'loading' || previewStatus === 'playing'

  const togglePreview = (): void => {
    if (previewBusy) {
      previewPlayer.stop()
      return
    }
    void previewPlayer.play(previewText, {
      model,
      localSpeechMode,
      localVoiceURI,
      voice,
      voiceDesignPrompt,
      format,
      voiceDesignPlaybackMode,
      voiceVolume,
    })
  }

  const changeEnabled = (next: boolean): void => {
    toggleSoundPlayer.schedule(next ? 'on' : 'off')
    setEnabled(next)
    if (!next) {
      previewPlayer.stop()
      setAutoPlay(false)
      setChanges((current) => ({ ...current, enabled: { kind: 'set' }, autoPlay: { kind: 'set' } }))
    } else {
      markChange('enabled')
    }
    setState('idle')
  }

  const changeAutoPlay = (next: boolean): void => {
    toggleSoundPlayer.schedule(next ? 'auto-on' : 'auto-off')
    setAutoPlay(next)
    if (next) {
      setEnabled(true)
      setChanges((current) => ({ ...current, autoPlay: { kind: 'set' }, enabled: { kind: 'set' } }))
    } else {
      markChange('autoPlay')
    }
    setState('idle')
  }

  return (
    <li className={open ? 'xmimo-tts-card xmimo-tts-card-open xmimo-ui-scope' : 'xmimo-tts-card xmimo-ui-scope'}>
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
      {open ? <div className="xmimo-tts-card-body xmimo-ui-stack">
        <SwitchModule
          t={t}
          enabled={enabled}
          autoPlay={autoPlay}
          writable={snapshot.writable}
          onEnabledChange={changeEnabled}
          onAutoPlayChange={changeAutoPlay}
        />
        <ApiKeyModule
          t={t}
          value={apiKey}
          message={apiKeyMessage}
          warning={apiKeyWarning}
          overridden={fieldOverridden('apiKey')}
          writable={snapshot.writable}
          onChange={(next) => { setApiKey(next); markChange('apiKey') }}
        />
        {enabled ? <DetailsModule
          t={t}
          connection={connection}
          open={detailsOpen}
          writable={snapshot.writable}
          autoPlay={autoPlay}
          voiceVolume={voiceVolume}
          model={model}
          localSpeechMode={localSpeechMode}
          localVoiceURI={localVoiceURI}
          voice={voice}
          format={format}
          voiceDesignPlaybackMode={voiceDesignPlaybackMode}
          voiceDesignPrompt={voiceDesignPrompt}
          voiceDesignCustomPrompt={voiceDesignCustomPrompt}
          voiceDesignAiState={voiceDesignAiState}
          voiceDesignAiCopy={t(VOICE_DESIGN_AI_COPY_KEYS[voiceDesignAiCopyIndex]!)}
          fieldOverridden={fieldOverridden}
          resetField={resetField}
          onToggle={() => { setDetailsOpen((current) => !current) }}
          onVoiceVolumeChange={(next) => { previewPlayer.setVolume(next); toggleSoundPlayer.setPreviewVolume(next); setVoiceVolume(next); markChange('voiceVolume') }}
          onVoiceVolumeInteractionEnd={(next) => { toggleSoundPlayer.previewVolume(next) }}
          onModelChange={(nextModel) => { setModel(nextModel); setVoiceDesignAiState('idle'); markChange('model'); if (nextModel === 'mimo-v2.5-tts-voicedesign') chooseVoiceDesignAiCopy() }}
          onVoiceDesignPromptChange={(next) => {
            setVoiceDesignPrompt(next)
            setVoiceDesignCustomPrompt(next)
            setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
            setState('idle')
            setVoiceDesignAiState('idle')
          }}
          onVoiceDesignPlaybackModeChange={(next) => { setVoiceDesignPlaybackMode(next); markChange('voiceDesignPlaybackMode') }}
          onVoiceChange={(next) => { setVoice(next); markChange('voice') }}
          onFormatChange={(next) => { setFormat(next); markChange('format') }}
          onLocalVoiceURIChange={(next) => { setLocalVoiceURI(next); markChange('localVoiceURI') }}
          onLocalSpeechModeChange={(next) => { setLocalSpeechMode(next); markChange('localSpeechMode') }}
          onVoiceDesignAiCopyChange={chooseVoiceDesignAiCopy}
          onGenerateVoiceDesign={() => { void generateVoiceDesign() }}
        /> : null}
        {enabled ? <PreviewModule
          t={t}
          enabled={enabled}
          status={previewStatus}
          text={previewText}
          onToggle={togglePreview}
          onTextChange={setPreviewText}
        /> : null}
        <SoundEffectsPanel
          t={t}
          controller={controller}
          enabled={soundEnabled}
          volume={soundVolume}
          pack={soundPack}
          taskSounds={taskSounds}
          clickSounds={clickSounds}
          writable={snapshot.writable}
          onEnabledChange={(next) => {
            setSoundEnabled(next)
            setTaskSounds(next)
            setClickSounds(next)
            setChanges((current) => ({ ...current, soundEnabled: { kind: 'set' }, taskSounds: { kind: 'set' }, clickSounds: { kind: 'set' } }))
            setState('idle')
          }}
          onVolumeChange={(next) => { setSoundVolume(next); markChange('soundVolume') }}
          onPackChange={(next) => { setSoundPack(next); markChange('soundPack') }}
        />
        <div className="xmimo-tts-card-actions">
          {uninstallState === 'idle' && latestVersion !== null
            ? <a className="xmimo-tts-update" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">{t('settings.updateAvailable')}</a>
            : null}
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
            {t('settings.source')}
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
