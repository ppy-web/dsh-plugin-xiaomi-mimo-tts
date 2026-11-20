import type { CSSProperties, ReactElement } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveTtsSettings, TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { AvatarStyleContext, VoiceAvatar } from './controls/voice-avatar.js'
import { ReadScopeCards } from './controls/read-scope-cards.js'
import { LensSlider } from './controls/lens-slider.js'
import { readVoiceIdHistory, readVoiceIdNames, subscribeVoiceIds, voiceIdRevision } from './voice-id-history.js'
import { VoiceReadingHeaderActions } from './voice-reading-links.js'
import {
  autoPlayWriteOps,
  buildVoiceReadingVoiceSource,
  formatVoiceRate,
  formatVoiceVolume,
  rateWriteOps,
  readScopeWriteOps,
  soundWriteOps,
  voiceChoiceWriteOps,
  volumeWriteOps,
  VOICE_RATE_RANGE,
} from './voice-reading-options.js'
import type { VoiceReadingWriteOp } from './voice-reading-options.js'
import { resolvedSettingsSnapshot, useSettingsSlice, useSettingsTranslation } from './scope.js'
import { createVoiceReadingWrites } from './voice-reading-writes.js'
import { VoiceReadingWarning } from './voice-reading-warning.js'
import { VoiceReadingProvider } from './voice-reading-provider.js'
import { VoiceReadingSelect } from './voice-reading-select.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { readMinimalMode, subscribeMinimalMode } from './minimal-mode.js'
import { externalReadingModel, externalReadingVoice, saveExternalSelection } from './external-selection.js'
import type { ExternalSpeechSelection, SpeechEngineState } from '../../host-api.js'

export interface VoiceReadingSectionInjected {
  scope: ConfigForm<TtsSettings>
  changes?: SnapshotSource<boolean> | undefined
  t: Translate
  localeRevision?: SnapshotSource<number> | undefined
  openPluginSettings: () => void
}

export type VoiceReadingSectionProps = PropsRuntime<'settings.section'> & Partial<InjectFace<VoiceReadingSectionInjected>>

export function VoiceReadingSection(props: VoiceReadingSectionProps): ReactElement | null {
  const { scope, t, openPluginSettings } = props
  if (scope === undefined || t === undefined || openPluginSettings === undefined) return null
  return <VoiceReadingPage scope={scope} t={t} localeRevision={props.localeRevision} changes={props.changes} openPluginSettings={() => {
    props.close()
    openPluginSettings()
  }} />
}

interface VoiceReadingPageProps {
  changes?: SnapshotSource<boolean> | undefined
  scope: ConfigForm<TtsSettings>
  t: Translate
  localeRevision?: SnapshotSource<number> | undefined
  openPluginSettings: () => void
}

const RANGE_SAVE_DELAY = 250

interface VoiceReadingRangesProps {
  t: Translate
  volume: number
  rate: number
  disabled: boolean
  minimal: boolean
  write: (ops: VoiceReadingWriteOp[], delay: number) => void
}

const VoiceReadingRanges = memo(function VoiceReadingRanges({ t, volume, rate, disabled, minimal, write }: VoiceReadingRangesProps): ReactElement {
  return <>
    <div className="xmimo-voice-reading-row xmimo-voice-reading-range-row">
      <span className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVolume')}</span>
      <LensSlider value={volume} disabled={disabled} minimal={minimal} commitOnEnd
        label={t('settings.voiceReadingVolume')} formatValue={formatVoiceVolume}
        onChange={value => write(volumeWriteOps(value), RANGE_SAVE_DELAY)} />
    </div>
    <div className="xmimo-voice-reading-row xmimo-voice-reading-range-row">
      <span className="xmimo-voice-reading-row-title">{t('settings.voiceReadingRate')}</span>
      <LensSlider value={rate} disabled={disabled} minimal={minimal} commitOnEnd {...VOICE_RATE_RANGE}
        label={t('settings.voiceReadingRate')} formatValue={formatVoiceRate}
        onChange={value => write(rateWriteOps(value), RANGE_SAVE_DELAY)} />
    </div>
  </>
})

function selectReadingSettings(snapshot: ConfigFormSnapshot<TtsSettings>) {
  const { enabled, autoPlay, provider, doubaoEnabled, breezeEnabled, deepseekEnabled, doubaoModel, doubaoVoice,
    doubaoClonedVoice, breezeVoice, deepseekVoice, model, voice, voiceDesignPrompt, readScope, voiceVolume, voiceRate,
    avatarStyle, soundEnabled, taskSounds, clickSounds } = resolvedSettingsSnapshot(snapshot)
  return { status: snapshot.status, writable: snapshot.writable, enabled, autoPlay, provider, doubaoEnabled, breezeEnabled,
    deepseekEnabled, doubaoModel, doubaoVoice, doubaoClonedVoice, breezeVoice, deepseekVoice, model, voice,
    voiceDesignPrompt, readScope, voiceVolume, voiceRate, avatarStyle, soundEnabled, taskSounds, clickSounds }
}

function VoiceReadingPage({ scope, t: translate, localeRevision, openPluginSettings, changes = IDLE_PLUGIN_CHANGES }: VoiceReadingPageProps): ReactElement | null {
  const t = useSettingsTranslation(translate, localeRevision)
  useEngineState()
  const external = externalEngine()
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, () => false)
  const snapshot = useSettingsSlice(scope, selectReadingSettings)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const voiceRevision = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  const library = useMemo(() => Object.fromEntries((['standard', 'cloned', 'breeze'] as const).map(kind => [kind, { history: readVoiceIdHistory(kind), names: readVoiceIdNames(kind) }])), [voiceRevision])
  const canWrite = useCallback(() => {
    const { status, writable } = scope.getSnapshot()
    return status === 'ready' && writable && !changes.getSnapshot()
  }, [scope, changes])
  const writes = useMemo(() => createVoiceReadingWrites(scope, canWrite), [scope, canWrite])
  useEffect(() => () => { void writes.flush() }, [writes])
  // A refused write keeps its queue; retry as soon as the Host accepts writes again.
  const writableNow = snapshot.status === 'ready' && snapshot.writable && !changing
  useEffect(() => { if (writableNow) void writes.flush() }, [writableNow, writes])
  const { patch, failed } = useSyncExternalStore(writes.subscribe, writes.getSnapshot, writes.getSnapshot)
  const settings = useMemo(() => resolveTtsSettings({ ...snapshot, ...patch }), [snapshot, patch])
  const { provider, model, voice, voiceDesignPrompt, doubaoModel, doubaoVoice, doubaoClonedVoice, breezeVoice, deepseekVoice } = settings
  const source = useMemo(() => buildVoiceReadingVoiceSource({
    provider, model, voice, voiceDesignPrompt, doubaoModel, doubaoVoice, doubaoClonedVoice, breezeVoice, deepseekVoice,
  }, [], library, t), [provider, model, voice, voiceDesignPrompt, doubaoModel, doubaoVoice, doubaoClonedVoice, breezeVoice, deepseekVoice, library, t])
  const voiceOptions = useMemo(() => {
    const voiceDesign = source.field === 'voiceDesignPrompt'
    const voiceProvider = voiceDesign ? 'xiaomi-design' : provider
    const customVoiceLabel = t('settings.voiceReadingCustomVoice')
    return [
      ...(source.choices.some(choice => choice.value === source.value) ? [] : [{
        id: source.value,
        label: customVoiceLabel,
        icon: <VoiceAvatar compact voice={voiceDesign ? undefined : { provider: voiceProvider, id: source.value }} label={customVoiceLabel} fallback="+" />,
      }]),
      ...source.choices.map(choice => ({
        id: choice.value,
        label: choice.detail ? `${choice.label} · ${choice.detail}` : choice.label,
        icon: <VoiceAvatar compact voice={{ provider: voiceProvider, id: choice.avatarId ?? choice.value }} label={choice.label} />,
      })),
    ]
  }, [source, provider, t])
  const [externalPending, setExternalPending] = useState<{ engine: SpeechEngineState; selection: ExternalSpeechSelection } | null>(null)
  const [externalFailed, setExternalFailed] = useState(false)
  const externalWrite = useRef(false)
  const externalSelection = externalPending && externalPending.engine.provider === external?.provider
    && externalPending.engine.configurationId === external?.configurationId ? externalPending.selection : external?.selection
  const externalModel = external?.models?.find(model => model.id === externalSelection?.model)
  const writeExternal = async (engine: SpeechEngineState, selection: ExternalSpeechSelection | undefined): Promise<void> => {
    if (!selection || externalWrite.current || !canWrite()) return
    externalWrite.current = true
    setExternalPending({ engine, selection })
    setExternalFailed(false)
    try {
      await saveExternalSelection(engine, selection)
    } catch {
      setExternalFailed(true)
    } finally {
      externalWrite.current = false
      setExternalPending(null)
    }
  }

  if (snapshot.status === 'unavailable') {
    return <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingUnavailable')}</p>
  }

  // The Host's first snapshot is `loading` with `writable: false`; treat that as
  // "not ready" so the page never claims the deployment is read-only while the
  // real values are still arriving.
  const ready = snapshot.status === 'ready'
  const unavailable = changing || !ready || !snapshot.writable
  const disabled = unavailable
  return <AvatarStyleContext.Provider value={settings.avatarStyle}><div className="xmimo-voice-reading" style={minimalMode ? undefined : {
    '--xmimo-voice-reading-background': `url(${hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)})`,
  } as CSSProperties}>
    <div className="xmimo-voice-reading-header">
      <p className="xmimo-voice-reading-description">{t('settings.voiceReadingDescription')}</p>
      <VoiceReadingHeaderActions t={t} openPluginSettings={openPluginSettings} />
    </div>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <VoiceReadingProvider value={settings.provider} doubaoEnabled={settings.doubaoEnabled} breezeEnabled={settings.breezeEnabled} deepseekEnabled={settings.deepseekEnabled} disabled={disabled} t={t} onChange={provider => {
      writes.write([{ op: 'set', path: ['provider'], value: provider }])
    }} />
    {ready ? <VoiceReadingWarning active={!changing} settings={settings} t={t} openPluginSettings={openPluginSettings} /> : null}
    {ready && !snapshot.writable && <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingReadOnly')}</p>}
    <div className="xmimo-voice-reading-card">
      {external ? <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy"><div className="xmimo-voice-reading-row-title">{t('settings.model')}</div></div>
        <VoiceReadingSelect label={t('settings.model')} value={externalSelection?.model ?? external.modelName ?? ''}
          options={(external.models ?? []).map(model => ({ id: model.id, label: model.name }))} disabled={disabled || externalPending !== null || !external.configurable}
          onSelect={model => {
            void writeExternal(external, externalReadingModel(external, model))
          }} />
      </div> : null}
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVoice')}</div>
          <div className="xmimo-voice-reading-row-hint">{t(external ? 'settings.externalManaged' : source.hintKey)}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingVoice')}
          value={external ? externalSelection?.voice ?? external.voiceName ?? '' : source.value}
          options={external ? (externalModel?.voices ?? []).map(voice => ({
            id: voice.id,
            label: voice.name,
            icon: <VoiceAvatar compact voice={{ provider: external.provider, model: externalModel?.id, id: voice.id }} label={voice.name} />,
          })) : voiceOptions}
          disabled={disabled || (external !== null && (externalPending !== null || !external.configurable || !externalSelection))}
          onSelect={(id) => {
            if (external) void writeExternal(external, externalReadingVoice(external, id))
            else writes.write(voiceChoiceWriteOps(source, id))
          }}
        />
      </div>
      <VoiceReadingRanges t={t} volume={settings.voiceVolume} rate={settings.voiceRate} disabled={disabled}
        minimal={minimalMode} write={writes.write} />
      <div className="xmimo-voice-reading-row xmimo-voice-reading-scope-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.readScope')}</div>
        </div>
        <ReadScopeCards value={settings.readScope} disabled={disabled} t={t} onChange={next => { writes.write(readScopeWriteOps(next)) }} />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingAutoPlay')}</div>
        </div>
        <Switch
          checked={settings.autoPlay}
          disabled={disabled}
          label={t('settings.voiceReadingAutoPlay')}
          onChange={(next) => {
            writes.write(autoPlayWriteOps(next, settings))
          }}
        />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingSound')}</div>
          <div className="xmimo-voice-reading-row-hint">{t('settings.voiceReadingSoundHint')}</div>
        </div>
        <Switch
          checked={settings.soundEnabled}
          disabled={disabled}
          label={t('settings.voiceReadingSound')}
          onChange={(next) => {
            writes.write(soundWriteOps(next, settings))
          }}
        />
      </div>
    </div>
    {(failed || externalFailed) && <p className="xmimo-voice-reading-failure" role="status">{t('settings.voiceReadingSaveFailed')}</p>}
  </div></AvatarStyleContext.Provider>
}
