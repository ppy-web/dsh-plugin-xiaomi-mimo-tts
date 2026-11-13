import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveTtsSettings, TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { VoiceAvatar } from './controls/voice-avatar.js'
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
import { useSettingsSnapshot } from './scope.js'
import { VoiceReadingWarning } from './voice-reading-warning.js'
import { VoiceReadingProvider } from './voice-reading-provider.js'
import { VoiceReadingSelect } from './voice-reading-select.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { readMinimalMode, subscribeMinimalMode } from './minimal-mode.js'
import { saveExternalReadingModel, saveExternalReadingVoice } from './external-selection.js'

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

type ReadingRange = 'voiceVolume' | 'voiceRate'
type ReadingRangeValues = Partial<Record<ReadingRange, number | undefined>>
const RANGE_SAVE_DELAY = 250

interface VoiceReadingRangesProps {
  t: Translate
  volume: number
  rate: number
  disabled: boolean
  minimal: boolean
  blocked: boolean
  canWrite: () => boolean
  onCommit: (ops: VoiceReadingWriteOp[]) => Promise<void>
}

/** Debounce the two sliders together so neither can write while the other is being dragged. */
function VoiceReadingRanges({ t, volume, rate, disabled, blocked, minimal, canWrite, onCommit }: VoiceReadingRangesProps): ReactElement {
  const [draft, setDraft] = useState<ReadingRangeValues>({})
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const active = useRef(new Set<ReadingRange>())
  const queued = useRef(new Map<ReadingRange, number>())
  const inFlight = useRef<Map<ReadingRange, number> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(true)
  const current = useRef({ canWrite, onCommit })
  current.current = { canWrite, onCommit }
  const wake = (): void => {
    clearTimeout(timer.current)
    setRevision(previous => previous + 1)
  }

  const flush = useCallback(async (): Promise<void> => {
    if (active.current.size || inFlight.current || !queued.current.size || !current.current.canWrite()) return
    const batch = queued.current
    queued.current = new Map()
    inFlight.current = batch
    if (mounted.current) setSaving(true)
    try {
      await current.current.onCommit([...batch].flatMap(([field, value]) => field === 'voiceVolume' ? volumeWriteOps(value) : rateWriteOps(value)))
    } finally {
      inFlight.current = null
      if (mounted.current) {
        setDraft(previous => {
          const next = { ...previous }
          for (const field of batch.keys()) if (!active.current.has(field) && !queued.current.has(field)) delete next[field]
          return next
        })
        setSaving(false)
        setRevision(previous => previous + 1)
      } else {
        void flush()
      }
    }
  }, [])

  useEffect(() => {
    if (disabled || blocked || active.current.size || !queued.current.size) return
    const scheduled = setTimeout(() => { void flush() }, RANGE_SAVE_DELAY)
    timer.current = scheduled
    return () => { clearTimeout(scheduled) }
  }, [blocked, disabled, flush, revision])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      active.current.clear()
      void flush()
    }
  }, [flush])

  const controls = (field: ReadingRange, saved: number) => ({
    value: draft[field] ?? saved,
    disabled: disabled || (blocked && !saving),
    minimal,
    onInteractionStart() { active.current.add(field); wake() },
    onChange(value: number) { setDraft(previous => ({ ...previous, [field]: value })) },
    onInteractionCancel() {
      active.current.delete(field)
      setDraft(previous => ({ ...previous, [field]: queued.current.get(field) ?? inFlight.current?.get(field) }))
      wake()
    },
    onInteractionEnd(value: number) {
      active.current.delete(field)
      if (value === (inFlight.current?.get(field) ?? saved)) {
        queued.current.delete(field)
        if (!inFlight.current?.has(field)) setDraft(previous => ({ ...previous, [field]: undefined }))
      } else {
        queued.current.set(field, value)
      }
      wake()
    },
  })

  return <>
    <div className="xmimo-voice-reading-row xmimo-voice-reading-range-row">
      <span className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVolume')}</span>
      <LensSlider {...controls('voiceVolume', volume)} label={t('settings.voiceReadingVolume')} formatValue={formatVoiceVolume} />
    </div>
    <div className="xmimo-voice-reading-row xmimo-voice-reading-range-row">
      <span className="xmimo-voice-reading-row-title">{t('settings.voiceReadingRate')}</span>
      <LensSlider {...controls('voiceRate', rate)} {...VOICE_RATE_RANGE} label={t('settings.voiceReadingRate')} formatValue={formatVoiceRate} />
    </div>
  </>
}

function VoiceReadingPage({ scope, t, openPluginSettings, changes = IDLE_PLUGIN_CHANGES }: VoiceReadingPageProps): ReactElement | null {
  useEngineState()
  const external = externalEngine()
  const externalModel = external?.models?.find(model => model.id === external.selection?.model)
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, () => false)
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const voiceRevision = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  const library = useMemo(() => Object.fromEntries((['standard', 'cloned', 'breeze'] as const).map(kind => [kind, { history: readVoiceIdHistory(kind), names: readVoiceIdNames(kind) }])), [voiceRevision])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const writeInFlight = useRef(false)
  const settings = useMemo(() => resolveTtsSettings(snapshot.value), [snapshot.value])
  const source = useMemo(
    () => buildVoiceReadingVoiceSource(settings, [], library),
    [settings, library],
  )

  const canWrite = (): boolean => !writeInFlight.current && !changes.getSnapshot() && scope.getSnapshot().writable
  const write = async (ops: VoiceReadingWriteOp[]): Promise<void> => {
    if (!canWrite() || ops.length === 0) return
    writeInFlight.current = true
    setBusy(true)
    setFailed(false)
    try {
      if (!await scope.mutate(ops as Parameters<ConfigForm<TtsSettings>['mutate']>[0])) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      writeInFlight.current = false
      setBusy(false)
    }
  }
  const writeExternal = async (save: () => Promise<void>): Promise<void> => {
    if (!canWrite()) return
    writeInFlight.current = true
    setBusy(true)
    setFailed(false)
    try {
      await save()
    } catch {
      setFailed(true)
    } finally {
      writeInFlight.current = false
      setBusy(false)
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
  const disabled = unavailable || busy
  const hasStoredChoice = source.choices.some((choice) => choice.value === source.value)
  const voiceDesign = source.field === 'voiceDesignPrompt'
  const voiceProvider = voiceDesign ? 'xiaomi-design' : settings.provider
  const customVoiceLabel = t('settings.voiceReadingCustomVoice')
  const voiceOptions = [
    ...(hasStoredChoice ? [] : [{
      id: source.value,
      label: customVoiceLabel,
      icon: <VoiceAvatar compact voice={voiceDesign ? undefined : { provider: voiceProvider, id: source.value }} label={customVoiceLabel} fallback="+" />,
    }]),
    ...source.choices.map((choice) => ({
      id: choice.value,
      label: choice.detail ? `${choice.label} · ${choice.detail}` : choice.label,
      icon: <VoiceAvatar compact voice={{ provider: voiceProvider, id: choice.avatarId ?? choice.value }} label={choice.label} />,
    })),
  ]
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
      void write([{ op: 'set', path: ['provider'], value: provider }])
    }} />
    {ready ? <VoiceReadingWarning active={!changing} settings={settings} t={t} openPluginSettings={openPluginSettings} /> : null}
    {ready && !snapshot.writable && <p className="xmimo-voice-reading-notice" role="status">{t('settings.voiceReadingReadOnly')}</p>}
    <div className="xmimo-voice-reading-card">
      {external ? <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy"><div className="xmimo-voice-reading-row-title">{t('settings.model')}</div></div>
        <VoiceReadingSelect label={t('settings.model')} value={external.selection?.model ?? external.modelName ?? ''}
          options={(external.models ?? []).map(model => ({ id: model.id, label: model.name }))} disabled={disabled || !external.configurable}
          onSelect={model => {
            void writeExternal(() => saveExternalReadingModel(external, model))
          }} />
      </div> : null}
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.voiceReadingVoice')}</div>
          <div className="xmimo-voice-reading-row-hint">{t(external ? 'settings.externalManaged' : source.hintKey)}</div>
        </div>
        <VoiceReadingSelect
          label={t('settings.voiceReadingVoice')}
          value={external ? external.selection?.voice ?? external.voiceName ?? '' : source.value}
          options={external ? (externalModel?.voices ?? []).map(voice => ({
            id: voice.id,
            label: voice.name,
            icon: <VoiceAvatar compact voice={{ provider: external.provider, model: externalModel?.id, id: voice.id }} label={voice.name} />,
          })) : voiceOptions}
          disabled={disabled || (external !== null && (!external.configurable || !external.selection))}
          onSelect={(id) => {
            if (external) void writeExternal(() => saveExternalReadingVoice(external, id))
            else void write(voiceChoiceWriteOps(source, id))
          }}
        />
      </div>
      <VoiceReadingRanges t={t} volume={settings.voiceVolume} rate={settings.voiceRate} disabled={unavailable}
        blocked={busy} minimal={minimalMode} canWrite={canWrite} onCommit={write} />
      <div className="xmimo-voice-reading-row xmimo-voice-reading-scope-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.readScope')}</div>
        </div>
        <ReadScopeCards value={settings.readScope} disabled={disabled} t={t} onChange={next => { void write(readScopeWriteOps(next)) }} />
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
            void write(autoPlayWriteOps(next, settings))
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
            void write(soundWriteOps(next, settings))
          }}
        />
      </div>
      <div className="xmimo-voice-reading-row">
        <div className="xmimo-voice-reading-copy">
          <div className="xmimo-voice-reading-row-title">{t('settings.readingCaptions')}</div>
          <div className="xmimo-voice-reading-row-hint">{t('settings.readingCaptionsHint')}</div>
        </div>
        <Switch checked={settings.showReadingCaptions} disabled={disabled} label={t('settings.readingCaptions')}
          onChange={next => { void write([{ op: 'set', path: ['showReadingCaptions'], value: next }]) }} />
      </div>
    </div>
    {failed && <p className="xmimo-voice-reading-failure" role="status">{t('settings.voiceReadingSaveFailed')}</p>}
  </div>
}
