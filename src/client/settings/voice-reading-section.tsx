import type { CSSProperties, ReactElement } from 'react'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveTtsSettings, TTS_HISTORY_EMPTY_ASSET_ROUTE, TTS_READ_SCOPES } from '../../shared.js'
import type { TtsReadScope, TtsSettings } from '../../shared.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { readVoiceIdHistory } from './voice-id-history.js'
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
import { readMinimalMode, subscribeMinimalMode } from './minimal-mode.js'

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
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, () => false)
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const [clonedHistory] = useState(() => readVoiceIdHistory('cloned'))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const settings = useMemo(() => resolveTtsSettings(snapshot.value), [snapshot.value])
  const source = useMemo(
    () => buildVoiceReadingVoiceSource(settings, clonedHistory),
    [settings, clonedHistory],
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
    </div>
    <p className="xmimo-voice-reading-intro">
      <span>{t('settings.voiceReadingIntro')}</span>
      <button type="button" className="xmimo-voice-reading-link" onClick={openPluginSettings}>
        <span className="xmimo-voice-reading-link-label">{t('settings.voiceReadingPluginSettings')}</span>
        <span aria-hidden="true">↗</span>
      </button>
    </p>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <VoiceReadingProvider value={settings.provider} disabled={disabled} t={t} onChange={provider => {
      write([{ op: 'set', path: ['provider'], value: provider }])
    }} />
    {ready ? <VoiceReadingWarning active={!changing} settings={settings} revision={snapshot.revision} t={t} openPluginSettings={openPluginSettings} /> : null}
    {ready && !snapshot.writable && <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingReadOnly')}</p>}
    <div className="xmimo-voice-reading-card">
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVoice')}</div>
          <div className="xmimo-voice-reading-row-hint">{t(source.hintKey)}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingVoice')}
          value={source.value}
          options={voiceOptions}
          disabled={disabled}
          onSelect={(id) => {
            write(voiceChoiceWriteOps(source, id))
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
    {failed && <p className="xmimo-voice-reading-failure" role="status">{t('settings.voiceReadingSaveFailed')}</p>}
  </div>
}
