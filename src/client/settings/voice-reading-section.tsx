import type { CSSProperties, ReactElement } from 'react'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveTtsSettings, TTS_HISTORY_EMPTY_ASSET_ROUTE, TTS_READ_SCOPES } from '../../shared.js'
import type { TtsReadScope, TtsSettings } from '../../shared.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { readVoiceIdHistory, readVoiceIdNames, subscribeVoiceIds, voiceIdRevision } from './voice-id-history.js'
import { VoiceReadingHeaderActions } from './voice-reading-links.js'
import {
  autoPlayWriteOps,
  buildVoiceReadingVoiceSource,
  formatVoiceRate,
  formatVoiceVolume,
  rateWriteOps,
  readScopeHintKey,
  readScopeLabelKey,
  readScopeWriteOps,
  soundWriteOps,
  voiceChoiceWriteOps,
  volumeWriteOps,
  VOICE_RATE_STEPS,
  VOICE_VOLUME_STEPS,
} from './voice-reading-options.js'
import type { VoiceReadingWriteOp } from './voice-reading-options.js'
import { useSettingsSnapshot } from './scope.js'
import { VoiceReadingWarning } from './voice-reading-warning.js'
import { VoiceReadingProvider } from './voice-reading-provider.js'
import { VoiceReadingSelect } from './voice-reading-select.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { readMinimalMode, subscribeMinimalMode } from './minimal-mode.js'
import { useExternalSelection } from './external-selection.js'

export interface VoiceReadingSectionInjected {
  scope: ConfigForm<TtsSettings>
  changes?: SnapshotSource<boolean> | undefined
  t: Translate
  openPluginSettings: () => void
}

export type VoiceReadingSectionProps = PropsRuntime<'settings.section'> & Partial<InjectFace<VoiceReadingSectionInjected>>

export function VoiceReadingSection(props: VoiceReadingSectionProps): ReactElement | null {
  const { scope, t, openPluginSettings } = props
  if (scope === undefined || t === undefined || openPluginSettings === undefined) return null
  return <VoiceReadingPage scope={scope} t={t} changes={props.changes} openPluginSettings={() => {
    props.close()
    openPluginSettings()
  }} />
}

interface VoiceReadingPageProps {
  changes?: SnapshotSource<boolean> | undefined
  scope: ConfigForm<TtsSettings>
  t: Translate
  openPluginSettings: () => void
}


function VoiceReadingPage({ scope, t, openPluginSettings, changes = IDLE_PLUGIN_CHANGES }: VoiceReadingPageProps): ReactElement | null {
  useEngineState()
  const external = externalEngine()
  const externalDraft = useExternalSelection(external)
  const externalModel = external?.models?.find(model => model.id === externalDraft.value?.model)
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, () => false)
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const voiceRevision = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  const library = useMemo(() => Object.fromEntries((['standard', 'cloned', 'breeze'] as const).map(kind => [kind, { history: readVoiceIdHistory(kind), names: readVoiceIdNames(kind) }])), [voiceRevision])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const settings = useMemo(() => resolveTtsSettings(snapshot.value), [snapshot.value])
  const source = useMemo(
    () => buildVoiceReadingVoiceSource(settings, [], library),
    [settings, library],
  )

  const write = (ops: VoiceReadingWriteOp[]): void => {
    if (changes.getSnapshot() || !snapshot.writable || ops.length === 0) return
    setBusy(true)
    setFailed(false)
    void scope.mutate(ops as Parameters<ConfigForm<TtsSettings>['mutate']>[0])
      .then((ok) => {
        if (!ok) setFailed(true)
      })
      .catch(() => {
        setFailed(true)
      })
      .finally(() => {
        setBusy(false)
      })
  }

  if (snapshot.status === 'unavailable') {
    return <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingUnavailable')}</p>
  }

  // The Host's first snapshot is `loading` with `writable: false`; treat that as
  // "not ready" so the page never claims the deployment is read-only while the
  // real values are still arriving.
  const ready = snapshot.status === 'ready'
  const disabled = changing || !ready || !snapshot.writable || busy
  const hasStoredChoice = source.choices.some((choice) => choice.value === source.value)
  const voiceOptions = [
    ...(hasStoredChoice ? [] : [{ id: source.value, label: t('settings.voiceReadingCustomVoice') }]),
    ...source.choices.map((choice) => ({
      id: choice.value,
      label: choice.detail ? `${choice.label} · ${choice.detail}` : choice.label,
    })),
  ]
  const readScopeOptions = TTS_READ_SCOPES.map((option) => ({ id: option, label: t(readScopeLabelKey(option)) }))

  return <div className="xmimo-voice-reading" style={minimalMode ? undefined : {
    '--xmimo-voice-reading-background': `url(${hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)})`,
  } as CSSProperties}>
    <div className="xmimo-voice-reading-header">
      <h2 className="xmimo-voice-reading-title">{t('settings.voiceReadingTitle')}</h2>
      <VoiceReadingHeaderActions t={t} openPluginSettings={openPluginSettings} />
      <p className="xmimo-voice-reading-description">{t('settings.voiceReadingDescription')}</p>
    </div>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <VoiceReadingProvider value={settings.provider} doubaoEnabled={settings.doubaoEnabled} breezeEnabled={settings.breezeEnabled} disabled={disabled} t={t} onChange={provider => {
      write([{ op: 'set', path: ['provider'], value: provider }])
    }} />
    {ready ? <VoiceReadingWarning active={!changing} settings={settings} t={t} openPluginSettings={openPluginSettings} /> : null}
    {ready && !snapshot.writable && <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingReadOnly')}</p>}
    <div className="xmimo-voice-reading-card">
      {external ? <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy"><div className="xmimo-voice-reading-row-title">{t('settings.model')}</div></div>
        <VoiceReadingSelect label={t('settings.model')} value={externalDraft.value?.model ?? external.modelName ?? ''}
          options={(external.models ?? []).map(model => ({ id: model.id, label: model.name }))} disabled={disabled || !external.configurable}
          onSelect={model => {
            const next = external.models!.find(item => item.id === model)!
            externalDraft.change({ model, voice: next.voices.some(item => item.id === externalDraft.value?.voice) ? externalDraft.value!.voice : next.voices[0]?.id ?? '', speechInstruction: '' })
          }} />
      </div> : null}
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVoice')}</div>
          <div className="xmimo-voice-reading-row-hint">{t(external ? 'settings.externalManaged' : source.hintKey)}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingVoice')}
          value={external ? externalDraft.value?.voice ?? external.voiceName ?? '' : source.value}
          options={external ? (externalModel?.voices ?? []).map(voice => ({ id: voice.id, label: voice.name })) : voiceOptions}
          disabled={disabled || (external !== null && !external.configurable)}
          onSelect={(id) => {
            if (external && externalDraft.value) externalDraft.change({ ...externalDraft.value, voice: id })
            else write(voiceChoiceWriteOps(source, id))
          }}
        />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVolume')}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingVolume')}
          value={String(settings.voiceVolume)}
          fallbackLabel={formatVoiceVolume(settings.voiceVolume)}
          options={VOICE_VOLUME_STEPS.map((step) => ({ id: String(step), label: formatVoiceVolume(step) }))}
          disabled={disabled}
          onSelect={(id) => {
            write(volumeWriteOps(Number(id)))
          }}
        />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingRate')}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingRate')}
          value={String(settings.voiceRate)}
          fallbackLabel={formatVoiceRate(settings.voiceRate)}
          options={VOICE_RATE_STEPS.map((step) => ({ id: String(step), label: formatVoiceRate(step) }))}
          disabled={disabled}
          onSelect={(id) => {
            write(rateWriteOps(Number(id)))
          }}
        />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.readScope')}</div>
          <div className="xmimo-voice-reading-row-hint">{t(readScopeHintKey(settings.readScope))}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.readScope')}
          value={settings.readScope}
          options={readScopeOptions}
          disabled={disabled}
          onSelect={(id) => {
            write(readScopeWriteOps(id as TtsReadScope))
          }}
        />
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
            write(autoPlayWriteOps(next, settings))
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
            write(soundWriteOps(next, settings))
          }}
        />
      </div>
    </div>
    {external?.configurable ? <div className="xmimo-voice-reading-row">
      <Button type="button" variant="outline" size="sm" disabled={disabled || !externalDraft.dirty} onClick={externalDraft.discard}>{t('settings.discard')}</Button>
      <Button type="button" variant="primary" size="sm" disabled={disabled || !externalDraft.dirty} onClick={() => {
        setBusy(true); setFailed(false)
        void externalDraft.save().catch(() => setFailed(true)).finally(() => setBusy(false))
      }}>{t(busy ? 'settings.saving' : 'settings.save')}</Button>
    </div> : null}
    {failed && <p className="xmimo-voice-reading-failure" role="status">{t('settings.voiceReadingSaveFailed')}</p>}
  </div>
}
