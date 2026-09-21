import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  TTS_API_KEY_STATUS_ROUTE,
  TTS_MIMO_LOGO_ASSET_ROUTE,
  TTS_UPDATE_ROUTE,
  getSoundEffectsModeFlags,
  isSupportedTtsApiKey,
  nextSoundEffectsMode,
  resolveSoundEffectsMode,
  resolveTtsSettings,
} from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { PreviewView } from '../playback/preview-player.js'
import { isRecord, useSettingsSnapshot } from './scope.js'
import { ToggleSoundPlayer } from '../sound-effects/toggle-sound-player.js'
import type { SoundEffectsController } from '../sound-effects/types.js'
import { ApiKeyModule } from './api-key-module.js'
import { resolveApiKeyViewState } from './api-key-state.js'
import type { ApiKeyStatus } from './api-key-state.js'
import { DetailsModule } from './details-module.js'
import { PreviewModule } from './preview-module.js'
import { SoundEffectsPanel } from './sound-effects-module.js'
import { SwitchModule } from './switch-module.js'
import { hostRoute } from '../host-route.js'
import type { DraftChange, DraftChanges, EditableSettingField, ResolvedSettings, SettingField, SettingsValues } from './types.js'

interface SettingsCardProps {
  view: 'summary' | 'page'
  scope: SettingsScope<TtsSettings>
  t: Translate
  controller: SoundEffectsController
}

type DraftSettings = SettingsValues

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'voiceVolume', 'voiceRate', 'readScope', 'model', 'localSpeechMode', 'localVoiceURI', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'soundEnabled', 'soundVolume', 'soundPack', 'taskSounds', 'clickSounds']
const RELEASES_URL = 'https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts/releases'

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

export function SettingsCard(props: SettingsCardProps): ReactElement | null {
  if (props.view === 'summary') return <>{props.t('settings.description')}</>
  return <SettingsPage scope={props.scope} t={props.t} controller={props.controller} />
}

function SettingsPage({ scope, t, controller }: Omit<SettingsCardProps, 'view'>): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [voiceVolume, setVoiceVolume] = useState(initial.voiceVolume)
  const [voiceRate, setVoiceRate] = useState(initial.voiceRate)
  const [readScope, setReadScope] = useState(initial.readScope)
  const [model, setModel] = useState(initial.model)
  const [localSpeechMode, setLocalSpeechMode] = useState(initial.localSpeechMode)
  const [localVoiceURI, setLocalVoiceURI] = useState(initial.localVoiceURI)
  const [voice, setVoice] = useState(initial.voice)
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState(initial.voiceDesignPrompt)
  const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = useState(initial.voiceDesignCustomPrompt)
  const [soundEnabled, setSoundEnabled] = useState(initial.soundEnabled)
  const [soundVolume, setSoundVolume] = useState(initial.soundVolume)
  const [soundPack, setSoundPack] = useState(initial.soundPack)
  const [taskSounds, setTaskSounds] = useState(initial.taskSounds)
  const [clickSounds, setClickSounds] = useState(initial.clickSounds)
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [soundEffectsOpen, setSoundEffectsOpen] = useState(false)
  const [previewText, setPreviewText] = useState(() => t('settings.previewDefaultText'))
  const [previewView, setPreviewView] = useState<PreviewView>({ status: 'idle', source: null, error: null })
  const [previewPlayer] = useState(() => new PreviewPlayer(setPreviewView))
  const [toggleSoundPlayer] = useState(() => new ToggleSoundPlayer())
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('loading')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, voiceVolume, voiceRate, readScope, model, localSpeechMode, localVoiceURI, voice, voiceDesignPrompt, voiceDesignCustomPrompt, soundEnabled, soundVolume, soundPack, taskSounds, clickSounds }
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
  const apiKeyViewState = resolveApiKeyViewState(apiKey, isSupportedTtsApiKey(apiKey), apiKeyStatus, changes.apiKey?.kind)
  const apiKeyMessage = t(apiKeyViewState === 'loading'
    ? 'settings.apiKeyLoading'
    : apiKeyViewState === 'missing'
      ? 'settings.apiKeyMissing'
      : apiKeyViewState === 'recognized'
        ? 'settings.apiKeyRecognized'
        : apiKeyViewState === 'unrecognized'
          ? 'settings.apiKeyUnsupportedSaved'
          : apiKeyViewState === 'unavailable'
            ? 'settings.apiKeyUnavailable'
            : apiKeyViewState === 'pending-save'
              ? 'settings.apiKeyPendingSave'
              : apiKeyViewState === 'pending-clear'
                ? 'settings.apiKeyPendingClear'
                : 'settings.apiKeyUnsupported')
  const apiKeyInvalid = apiKeyViewState === 'pending-invalid' || apiKeyViewState === 'unrecognized'
  const apiKeyClearable = hasOverride('apiKey') && changes.apiKey?.kind !== 'clear'

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
        setApiKeyStatus(status.configured !== true ? 'missing' : status.supported === true ? 'recognized' : 'unrecognized')
      })
      .catch(() => {
        if (active) setApiKeyStatus('unavailable')
      })
    return () => { active = false }
  }, [snapshot.status, value])

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setVoiceVolume(next.voiceVolume)
    setVoiceRate(next.voiceRate)
    setReadScope(next.readScope)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setSoundEnabled(next.soundEnabled)
    setSoundVolume(next.soundVolume)
    setSoundPack(next.soundPack)
    setTaskSounds(next.taskSounds)
    setClickSounds(next.clickSounds)
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

  const resetField = (field: EditableSettingField): void => {
    markChange(field, 'clear')
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'voiceVolume') setVoiceVolume(base.voiceVolume)
    if (field === 'voiceRate') setVoiceRate(base.voiceRate)
    if (field === 'readScope') setReadScope(base.readScope)
    if (field === 'model') setModel(base.model)
    if (field === 'localSpeechMode') setLocalSpeechMode(base.localSpeechMode)
    if (field === 'localVoiceURI') setLocalVoiceURI(base.localVoiceURI)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'voiceDesignPrompt') setVoiceDesignPrompt(base.voiceDesignPrompt)
    if (field === 'voiceDesignCustomPrompt') setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt)
    if (field === 'soundEnabled') setSoundEnabled(base.soundEnabled)
    if (field === 'soundVolume') setSoundVolume(base.soundVolume)
    if (field === 'soundPack') setSoundPack(base.soundPack)
    if (field === 'taskSounds') setTaskSounds(base.taskSounds)
    if (field === 'clickSounds') setClickSounds(base.clickSounds)
  }

  const clearApiKey = (): void => {
    setApiKey('')
    markChange('apiKey', 'clear')
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setVoiceVolume(next.voiceVolume)
    setVoiceRate(next.voiceRate)
    setReadScope(next.readScope)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setSoundEnabled(next.soundEnabled)
    setSoundVolume(next.soundVolume)
    setSoundPack(next.soundPack)
    setTaskSounds(next.taskSounds)
    setClickSounds(next.clickSounds)
    setApiKey('')
    setChanges({})
    setState('idle')
  }

  const save = async (): Promise<void> => {
    setDetailsOpen(false)
    setSoundEffectsOpen(false)
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

  const previewBusy = previewView.status === 'loading' || previewView.status === 'playing'

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
      voiceVolume,
      voiceRate,
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

  const applySoundEffectsMode = (mode: ReturnType<typeof resolveSoundEffectsMode>): void => {
    const previousMode = resolveSoundEffectsMode(soundEnabled, taskSounds, clickSounds)
    const flags = getSoundEffectsModeFlags(mode)
    controller.update({ ...flags, volume: soundVolume, pack: soundPack })
    if (previousMode === 'off' && mode !== 'off') controller.play('toggle-on')
    setSoundEnabled(flags.enabled)
    setTaskSounds(flags.taskSounds)
    setClickSounds(flags.clickSounds)
    setChanges((current) => ({ ...current, soundEnabled: { kind: 'set' }, taskSounds: { kind: 'set' }, clickSounds: { kind: 'set' } }))
    setState('idle')
  }

  const changeSoundEnabled = (next: boolean): void => {
    applySoundEffectsMode(next ? 'all' : 'off')
  }

  const cycleSoundEffectsMode = (): void => {
    const currentMode = resolveSoundEffectsMode(soundEnabled, taskSounds, clickSounds)
    applySoundEffectsMode(nextSoundEffectsMode(currentMode))
  }

  return (
    <div className="xmimo-tts-card xmimo-tts-card-open xmimo-ui-scope">
      <div className="xmimo-tts-card-body xmimo-ui-stack">
        <SwitchModule
          t={t}
          enabled={enabled}
          autoPlay={autoPlay}
          soundEnabled={soundEnabled}
          writable={snapshot.writable}
          onEnabledChange={changeEnabled}
          onAutoPlayChange={changeAutoPlay}
          onSoundEnabledChange={changeSoundEnabled}
        />
        <ApiKeyModule
          t={t}
          value={apiKey}
          message={apiKeyMessage}
          invalid={apiKeyInvalid}
          clearable={apiKeyClearable}
          writable={snapshot.writable}
          onChange={(next) => { setApiKey(next); markChange('apiKey') }}
          onClear={clearApiKey}
        />
        {enabled ? <DetailsModule
          t={t}
          open={detailsOpen}
          writable={snapshot.writable}
          autoPlay={autoPlay}
          voiceVolume={voiceVolume}
          voiceRate={voiceRate}
          readScope={readScope}
          model={model}
          localSpeechMode={localSpeechMode}
          localVoiceURI={localVoiceURI}
          voice={voice}
          voiceDesignPrompt={voiceDesignPrompt}
          voiceDesignCustomPrompt={voiceDesignCustomPrompt}
          fieldOverridden={fieldOverridden}
          resetField={resetField}
          onToggle={() => { setDetailsOpen((current) => !current) }}
          onVoiceVolumeChange={(next) => { previewPlayer.setVolume(next); toggleSoundPlayer.setPreviewVolume(next); setVoiceVolume(next); markChange('voiceVolume') }}
          onVoiceVolumeInteractionEnd={(next) => { toggleSoundPlayer.previewVolume(next) }}
          onVoiceRateChange={(next) => { setVoiceRate(next); markChange('voiceRate') }}
          onVoiceRateInteractionEnd={(next) => { controller.play('success', { playbackRate: next }) }}
          onReadScopeChange={(next) => { setReadScope(next); markChange('readScope') }}
          onModelChange={(nextModel) => { setModel(nextModel); markChange('model') }}
          onVoiceDesignPromptChange={(next) => {
            setVoiceDesignPrompt(next)
            setVoiceDesignCustomPrompt(next)
            setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
            setState('idle')
          }}
          onVoiceChange={(next) => { setVoice(next); markChange('voice') }}
          onLocalVoiceURIChange={(next) => { setLocalVoiceURI(next); markChange('localVoiceURI') }}
          onLocalSpeechModeChange={(next) => { setLocalSpeechMode(next); markChange('localSpeechMode') }}
        /> : null}
        {enabled ? <PreviewModule
          t={t}
          enabled={enabled}
          status={previewView.status}
          source={previewView.source}
          error={previewView.error}
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
          open={soundEffectsOpen}
          onToggle={() => { setSoundEffectsOpen((current) => !current) }}
          onCycle={cycleSoundEffectsMode}
          onVolumeChange={(next) => { setSoundVolume(next); markChange('soundVolume') }}
          onPackChange={(next) => { setSoundPack(next); markChange('soundPack') }}
        />
        <div className="xmimo-tts-card-actions">
          {latestVersion !== null
            ? <a className="xmimo-tts-update" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">{t('settings.updateAvailable')}</a>
            : null}
          <a
            className="xmimo-tts-star"
            href="https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('settings.source')}
          </a>
          {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
          {state === 'saved' && !dirty ? <span role="status">{t('settings.saved')}</span> : null}
          {state === 'failed' ? <span className="xmimo-tts-failed" role="status">{t('settings.failed')}</span> : null}
          <button type="button" className="xmimo-tts-discard" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={discard}>
            {t('settings.discard')}
          </button>
          <button type="button" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={() => { void save() }}>
            {state === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
