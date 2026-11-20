import { availableTtsProviders, TTS_PROVIDER_SWITCH } from '../../types/providers.js'
import { useExternalSelection } from './external-selection.js'
import type { ReactElement, RefObject } from 'react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { GoHistory } from 'react-icons/go'
import { RiSwitchFill } from 'react-icons/ri'
import {
  getSoundEffectsModeFlags,
  isSupportedTtsApiKey,
  resolveSoundEffectsScope,
  resolveTtsSettings,
} from '../../shared.js'
import { saveSettingsDraft, validateSettingsDraft, EDITABLE_SETTING_FIELDS, BUILTIN_SETTING_FIELDS, SaveSettingsError } from './save-settings.js'
import { API_KEY_BY_PROVIDER, API_KEY_STATE, EMPTY_DRAFT, draftFieldDirty, editDraft, hasLayerField, isApiKeyField, pruneDraftEdits } from './draft.js'
import type { ApiKeyField, DraftSettings } from './draft.js'
import { useEngineState } from '../use-engine-state.js'
import { engineStateStore, externalEngine } from '../engine-state.js'
import { invalidateApiKeyStatus, useApiKeyStatus } from '../conversation/api-key-status.js'
import type { TtsSettings, SoundEffectsScope } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { PreviewView } from '../playback/preview-player.js'
import { isRecord, resolvedSettingsSnapshot, settingsSliceEqual, settingsValueEqual, useSettingsSlice, useSettingsTranslation } from './scope.js'
import type { SoundEffectsController } from '../sound-effects/types.js'
import { ApiKeyModule } from './api-key-module.js'
import { resolveApiKeyViewState } from './api-key-state.js'
import { AvatarStyleContext } from './controls/voice-avatar.js'
import { DETAIL_FIELDS, DetailsModule } from './details-module.js'
import { BROADCAST_FIELDS, PreviewModule } from './preview-module.js'
import { SoundEffectsPanel } from './sound-effects-module.js'
import { SidebarSettings } from './sidebar-settings.js'
import { withSidebarLoading } from './sidebar-loading.js'
import { SwitchModule } from './switch-module.js'
import { readMinimalMode, subscribeMinimalMode, writeMinimalMode } from './minimal-mode.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { DraftChanges, EditableSettingField, SettingField } from './types.js'
import type { AudioHistory } from '../history/audio-history.js'
import { lazyPanel } from '../lazy-panel.js'
import { unrestrictedAudioFocus } from '../playback/tab-audio-focus.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { isSpeechBusy } from '../announcements/speech-activity.js'
import type { AudioFocus } from '../playback/tab-audio-focus.js'
import { SettingsSearchContext } from './settings-search-context.js'
import { searchSettings } from './settings-search.js'

const AudioHistoryPage = lazyPanel(() => import('../history/audio-history-page.js').then(module => module.AudioHistoryPage))

export interface SettingsCardProps {
  view: 'summary' | 'page'
  initialPanel?: 'mixer' | undefined
  renderHeader?: (search?: { query: string; onQueryChange: (query: string) => void }) => ReactElement
  onSidebarChange?: ((mounted: boolean) => void) | undefined
  onOpenProviderSettings?: ((bundle: string) => void) | undefined
  scope: ConfigForm<TtsSettings>
  t: Translate
  localeRevision?: SnapshotSource<number> | undefined
  controller: SoundEffectsController
  beforePreview?: (() => void) | undefined
  beforeHistoryPlayback?: (() => void) | undefined
  changes?: SnapshotSource<boolean> | undefined
  history?: AudioHistory | undefined
  audioFocus?: AudioFocus | undefined
  speechActivity?: SpeechActivity | undefined
}

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

const VOICE_FIELDS = new Set<EditableSettingField>(['deepseekVoice', 'doubaoModel', 'doubaoVoice', 'doubaoClonedVoice',
  'breezeVoice', 'breezeInstruction', 'model', 'voice', 'doubaoInstruction', 'instruction'])

function pickSettings<K extends EditableSettingField>(settings: DraftSettings, fields: readonly K[]): Pick<DraftSettings, K> {
  return Object.fromEntries(fields.map(field => [field, settings[field]])) as Pick<DraftSettings, K>
}

function selectCardSettings(snapshot: ConfigFormSnapshot<TtsSettings>) {
  const resolved = resolvedSettingsSnapshot(snapshot)
  const values = pickSettings(resolved, EDITABLE_SETTING_FIELDS)
  const { status, writable, user } = snapshot
  return { ...values, status, writable, overrides: EDITABLE_SETTING_FIELDS.filter(field => hasLayerField(user, field)) }
}

/** Keep memoized modules on stable event props while their handlers read the latest committed render. */
function useSettingsActions<T extends Record<string, (...args: never[]) => unknown>>(actions: T): T {
  const current = useRef(actions)
  const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
  useCommitEffect(() => { current.current = actions }, [actions])
  return useMemo(() => Object.fromEntries(Object.keys(current.current).map(name => [
    name, (...args: never[]) => current.current[name]?.(...args),
  ])) as T, [])
}

const SettingsSwitches = memo(SwitchModule)
const SettingsApiKey = memo(ApiKeyModule)
function compareModuleProps<T extends { draft: Partial<DraftSettings>; overrides: readonly SettingField[] }>(
  { draft: previous, overrides: previousOverrides, ...previousProps }: T,
  { draft: next, overrides: nextOverrides, ...nextProps }: T,
): boolean {
  return settingsSliceEqual(previous, next) && settingsValueEqual(previousOverrides, nextOverrides)
    && settingsSliceEqual(previousProps, nextProps)
}

const SettingsDetails = memo(DetailsModule, compareModuleProps)
const SettingsBroadcast = memo(PreviewModule, compareModuleProps)
const SettingsSounds = memo(SoundEffectsPanel)

function HistoryLink({ history, t, onOpen, buttonRef }: { history: AudioHistory; t: Translate; onOpen: () => void; buttonRef: RefObject<HTMLButtonElement> }): ReactElement {
  const view = useSyncExternalStore(history.subscribe, history.getSnapshot)
  return <Button ref={buttonRef} type="button" className="xmimo-tts-history-link" variant="toolbar" size="sm" onClick={onOpen}>
    <GoHistory size={14} aria-hidden="true" focusable="false" />
    <span className="xmimo-tts-action-label">{t('history.shortTitle')} · {view.entries.length}</span>
  </Button>
}

export function SettingsCard(props: SettingsCardProps): ReactElement | null {
  if (props.view === 'summary') return <>{props.t('settings.description')}</>
  return <SettingsPage {...props} />
}

const SettingsPage = memo(function SettingsPage({ scope, t: translate, localeRevision, controller, history, speechActivity, beforePreview, beforeHistoryPlayback, initialPanel, renderHeader, onSidebarChange, onOpenProviderSettings, changes: pluginChanges = IDLE_PLUGIN_CHANGES, audioFocus = unrestrictedAudioFocus }: Omit<SettingsCardProps, 'view'>): ReactElement | null {
  const t = useSettingsTranslation(translate, localeRevision)
  useEngineState()
  const external = externalEngine()
  const externalDraft = useExternalSelection(external)
  const snapshot = useSettingsSlice(scope, selectCardSettings)
  const changing = useSyncExternalStore(pluginChanges.subscribe, pluginChanges.getSnapshot, pluginChanges.getSnapshot)
  const writable = snapshot.writable && !changing
  const [edits, setEdits] = useState(EMPTY_DRAFT)
  const { changes, keys: apiKeys } = edits
  const draft = useMemo(() => {
    const values = { ...snapshot, ...edits.values }
    return values.enabled ? values : { ...values, autoPlay: false }
  }, [snapshot, edits.values])
  const { enabled, autoPlay, soundEnabled, voiceVolume, voiceRate, soundVolume, soundPack, taskSounds, clickSounds,
    mossEnabled, localVoiceEngine, model, provider, doubaoEnabled, breezeEnabled,
    deepseekEnabled, avatarStyle } = draft
  const apiKey = apiKeys[provider]
  const apiKeyField = API_KEY_BY_PROVIDER[provider]
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [saveError, setSaveError] = useState<'api-key-rejected' | 'host-rejected' | 'provider-count' | 'unknown' | null>(null)
  const saveInFlight = useRef(false)
  const [openPanel, setOpenPanel] = useState<'mixer' | 'sound' | 'broadcast' | null>(initialPanel ?? null)
  const togglePanel = (panel: 'mixer' | 'sound' | 'broadcast'): void => setOpenPanel(current => current === panel ? null : panel)
  const [query, setQuery] = useState('')
  const externalName = external?.name
  const doubaoClone = draft.doubaoModel === 'seed-icl-2.0'
  const search = useMemo(() => renderHeader ? searchSettings(query, t, {
    provider, externalName, voiceDesign: model === 'mimo-v2.5-tts-voicedesign',
    doubaoClone, soundEnabled, mossEnabled, mossSelected: mossEnabled && localVoiceEngine === 'moss',
  }) : null, [renderHeader, query, t, provider, externalName, model, doubaoClone, soundEnabled, mossEnabled, localVoiceEngine])
  const [previewText, setPreviewText] = useState(() => t('settings.previewDefaultText'))
  const [previewView, setPreviewView] = useState<PreviewView>({ status: 'idle', source: null, error: null })
  const [previewPlayer] = useState(() => new PreviewPlayer(setPreviewView, history))
  useEffect(() => engineStateStore.subscribe(() => previewPlayer.stop()), [previewPlayer])
  useEffect(() => speechActivity?.register(() => isSpeechBusy(previewPlayer.getView().status), () => previewPlayer.stop()), [speechActivity, previewPlayer])
  useEffect(() => audioFocus.subscribe(() => {
    if (!audioFocus.canPlay()) previewPlayer.stop()
  }), [audioFocus, previewPlayer])
  const apiKeyStatus = useApiKeyStatus(snapshot.status === 'ready' && !changing, provider)
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, () => false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyLinkRef = useRef<HTMLButtonElement>(null)
  const historyWasOpen = useRef(false)

  const hasOverride = (field: EditableSettingField): boolean => snapshot.overrides.includes(field)
  const fieldOverridden = (field: EditableSettingField): boolean => {
    const change = changes[field]
    return change ? change.kind === 'set' : hasOverride(field)
  }
  const raw = scope.getSnapshot().value
  const fieldDirty = (field: EditableSettingField): boolean =>
    draftFieldDirty(changes[field], draft[field], raw?.[field] ?? snapshot[field], hasOverride(field))
  const hasApiKeyDraft = (field: ApiKeyField): boolean => changes[field]?.kind === 'set' && apiKeys[API_KEY_STATE[field]].trim().length > 0
  const apiKeyDirty = (Object.keys(API_KEY_STATE) as ApiKeyField[]).some(hasApiKeyDraft)
  const dirtyFields = (Object.keys(changes) as SettingField[]).filter(field => !isApiKeyField(field) && fieldDirty(field))
  const dirty = dirtyFields.length > 0 || apiKeyDirty || externalDraft.dirty
  const validationError = external ? null : validateSettingsDraft(draft)
  const saveableDirty = external ? externalDraft.dirty || dirtyFields.some(field => !BUILTIN_SETTING_FIELDS.has(field)) : dirty
  const apiKeyViewState = resolveApiKeyViewState(apiKey, isSupportedTtsApiKey(apiKey, provider), apiKeyStatus, changes[apiKeyField]?.kind)
  const apiKeyMessage = t(apiKeyViewState === 'loading'
    ? 'settings.apiKeyLoading'
    : apiKeyViewState === 'missing'
      ? 'settings.apiKeyMissing'
      : apiKeyViewState === 'recognized'
        ? provider === 'doubao' || provider === 'deepseek' ? 'settings.doubaoKeyConfigured' : 'settings.apiKeyRecognized'
        : apiKeyViewState === 'unrecognized'
          ? 'settings.apiKeyUnsupportedSaved'
          : apiKeyViewState === 'unavailable'
            ? 'settings.apiKeyUnavailable'
            : apiKeyViewState === 'pending-save'
              ? 'settings.apiKeyPendingSave'
              : 'settings.apiKeyUnsupported')
  const apiKeyInvalid = apiKeyViewState === 'pending-invalid' || apiKeyViewState === 'unrecognized'

  useEffect(() => () => { void previewPlayer.dispose() }, [previewPlayer])

  useEffect(() => {
    controller.update({ enabled: soundEnabled, volume: soundVolume, pack: soundPack, taskSounds, clickSounds })
  }, [clickSounds, controller, soundEnabled, soundPack, soundVolume, taskSounds])

  useEffect(() => () => {
    const accepted = resolvedSettingsSnapshot(scope.getSnapshot())
    controller.update({ enabled: accepted.soundEnabled, volume: accepted.soundVolume, pack: accepted.soundPack,
      taskSounds: accepted.taskSounds, clickSounds: accepted.clickSounds })
  }, [controller, scope])

  useEffect(() => { previewPlayer.setVolume(voiceVolume) }, [previewPlayer, voiceVolume])

  useEffect(() => {
    if (!historyOpen && historyWasOpen.current) historyLinkRef.current?.focus({ preventScroll: true })
    historyWasOpen.current = historyOpen
  }, [historyOpen])

  const clearSaveMessage = (): void => {
    setState(current => current === 'saving' ? current : 'idle')
    setSaveError(null)
  }

  const edit = (values: Partial<DraftSettings>, kind: 'set' | 'clear' = 'set'): void => {
    const host = scope.getSnapshot()
    const accepted = resolvedSettingsSnapshot(host)
    setEdits(current => editDraft(current, values, kind, {
      accepted: field => host.value?.[field] ?? accepted[field],
      overridden: field => hasLayerField(host.user, field),
    }, saveInFlight.current))
    clearSaveMessage()
  }

  const resetField = (field: EditableSettingField): void => {
    previewPlayer.stop()
    const base = resolveTtsSettings(layerSettings(scope.getSnapshot().base))
    const next = field === 'provider' && !availableTtsProviders(doubaoEnabled, breezeEnabled, deepseekEnabled).includes(base.provider)
      ? 'xiaomi' : field === 'localVoiceEngine' && !mossEnabled ? 'browser' : base[field]
    edit({ [field]: next }, 'clear')
    if (field === 'mossEnabled' && !base.mossEnabled && localVoiceEngine === 'moss') edit({ localVoiceEngine: 'browser' })
  }

  const discard = (): void => {
    externalDraft.discard()
    setEdits(EMPTY_DRAFT)
    previewPlayer.stop()
    clearSaveMessage()
  }

  const save = async (sidebar?: boolean): Promise<void> => {
    if (!writable || pluginChanges.getSnapshot() || saveInFlight.current) return
    saveInFlight.current = true
    setState('saving')
    setSaveError(null)
    try {
      const commit = async (): Promise<void> => {
        const nextDraft = sidebar === undefined ? draft : { ...draft, showInSidebar: sidebar }
        const nextChanges: DraftChanges = sidebar === undefined ? changes : { ...changes, showInSidebar: { kind: 'set' } }
        await externalDraft.save()
        await saveSettingsDraft(scope, nextDraft, nextChanges, apiKeys, external !== null)
        if (!external && apiKeyDirty) invalidateApiKeyStatus()
        setEdits(current => pruneDraftEdits(current, changes, external !== null))
        setState('saved')
        if (sidebar !== undefined) onSidebarChange?.(sidebar)
      }
      if (sidebar === undefined) await commit()
      else await withSidebarLoading(sidebar, t, commit)
    } catch (error) {
      const code = error instanceof SaveSettingsError ? error.code : null
      setSaveError(code === 'api-key-rejected' || code === 'host-rejected' || code === 'provider-count' ? code : 'unknown')
      setState('failed')
    } finally { saveInFlight.current = false }
  }

  const previewBusy = previewView.status === 'loading' || previewView.status === 'playing'

  const togglePreview = (text: string): void => {
    audioFocus.claim()
    if (!audioFocus.canPlay()) return
    if (previewBusy) {
      previewPlayer.stop()
      return
    }
    if (validationError !== null || (!external && changes[API_KEY_BY_PROVIDER[provider]] !== undefined)) {
      previewPlayer.stop()
      setPreviewView({ status: 'error', source: provider === 'xiaomi' ? 'mimo' : provider, error: validationError !== null ? 'voice-required' : 'save-key-first' })
      return
    }
    beforePreview?.()
    void previewPlayer.play(text, { ...resolvedSettingsSnapshot(scope.getSnapshot()), ...draft, ...(external ? { externalSelection: externalDraft.value } : {}) })
  }

  const changeEnabled = (next: boolean): void => {
    if (soundEnabled && clickSounds && audioFocus.canPlay()) controller.play(next ? 'toggle-on' : 'toggle-off')
    edit(next ? { enabled: true } : { enabled: false, autoPlay: false })
  }

  const changeAutoPlay = (next: boolean): void => {
    if (soundEnabled && clickSounds && audioFocus.canPlay()) controller.play(next ? 'toggle-on' : 'toggle-off')
    edit(next ? { autoPlay: true, enabled: true } : { autoPlay: false })
  }

  const changeProvider = (next: typeof provider): void => {
    if (soundEnabled && clickSounds) controller.play('select')
    previewPlayer.stop()
    edit({ provider: next })
  }

  const changeSoundScope = (scope: SoundEffectsScope): void => {
    const { taskSounds: nextTask, clickSounds: nextClick } = getSoundEffectsModeFlags(scope)
    controller.update({ enabled: soundEnabled, taskSounds: nextTask, clickSounds: nextClick, volume: soundVolume, pack: soundPack })
    edit({ taskSounds: nextTask, clickSounds: nextClick })
  }

  const changeSoundEnabled = (next: boolean): void => {
    const { taskSounds: nextTask, clickSounds: nextClick } = getSoundEffectsModeFlags(resolveSoundEffectsScope(taskSounds, clickSounds))
    if (!next && soundEnabled && clickSounds) controller.play('toggle-off')
    controller.update({ enabled: next, taskSounds: nextTask, clickSounds: nextClick, volume: soundVolume, pack: soundPack })
    if (next && nextClick) controller.play('toggle-on')
    edit({ soundEnabled: next, taskSounds: nextTask, clickSounds: nextClick })
  }

  const change = <K extends EditableSettingField>(field: K, value: DraftSettings[K]): void => edit({ [field]: value })
  const actions = useSettingsActions({
    changeProvider, changeEnabled, changeAutoPlay, changeSoundEnabled, changeSoundScope, resetField,
    changeApiKey(next: string) {
      setEdits(current => ({
        ...current,
        keys: { ...current.keys, [provider]: next },
        changes: { ...current.changes, [apiKeyField]: { kind: 'set' } },
      }))
      clearSaveMessage()
    },
    changeExternal(next: Parameters<typeof externalDraft.change>[0]) { previewPlayer.stop(); externalDraft.change(next); clearSaveMessage() },
    update<K extends EditableSettingField>(field: K, next: DraftSettings[K]) {
      if (VOICE_FIELDS.has(field)) previewPlayer.stop()
      change(field, next)
    },
    changeVoiceDesignPrompt(next: string) { edit({ voiceDesignPrompt: next, voiceDesignCustomPrompt: next }) },
    changeMossVoice(voiceId: string, voiceName: string) { edit({ mossVoice: voiceId, mossVoiceName: voiceName }) },
    changeMossEnabled(next: boolean) {
      previewPlayer.stop()
      edit(!next && localVoiceEngine === 'moss' ? { mossEnabled: next, localVoiceEngine: 'browser' } : { mossEnabled: next })
    },
    changeProviderEnabled(target: keyof typeof TTS_PROVIDER_SWITCH, next: boolean) {
      const count = availableTtsProviders(doubaoEnabled, breezeEnabled, deepseekEnabled).length
      if (next ? count >= 3 : count <= 2) return
      previewPlayer.stop()
      edit({ [TTS_PROVIDER_SWITCH[target]]: next, ...(!next && provider === target ? { provider: 'xiaomi' } : {}) })
    },
    toggleMixer() { togglePanel('mixer') },
    toggleSound() { togglePanel('sound') },
    toggleBroadcast() { togglePanel('broadcast') },
    togglePreview() { togglePreview(previewText) },
    changePreviewText(next: string) { previewPlayer.stop(); setPreviewText(next) },
    previewVoiceVolume(next: number) { previewPlayer.setVolume(next) },
    cancelVoiceVolume() { previewPlayer.setVolume(voiceVolume) },
    endVoiceVolume(next: number) {
      if (audioFocus.canPlay()) controller.previewVolume(next)
    },
    endVoiceRate(next: number) { controller.play('success', { playbackRate: next }) },
    toggleMinimalMode() {
      const next = !minimalMode
      writeMinimalMode(next)
      if (next) previewPlayer.stop()
    },
    changeVoiceVolume(next: number) { change('voiceVolume', next) },
    changeVoiceRate(next: number) { change('voiceRate', next) },
    changeSoundVolume(next: number) { change('soundVolume', next) },
    changeSoundPack(next: DraftSettings['soundPack']) { change('soundPack', next) },
    changeAcceptExternalProviders(next: boolean) { change('acceptExternalProviders', next) },
    changeAudioResponseStyle(next: DraftSettings['audioResponseStyle']) { change('audioResponseStyle', next) },
    resetAudioResponseStyle() { resetField('audioResponseStyle') },
    changeQqbotEnabled(next: boolean) { change('qqbotEnabled', next) },
    changeAnnouncementSources(next: DraftSettings['announcementSources']) { change('announcementSources', next) },
    resetAnnouncementSources() { resetField('announcementSources') },
  })

  if (snapshot.status === 'unavailable') return renderHeader?.() ?? null

  if (historyOpen && history) return <>{renderHeader?.()}
    {changing ? <p className="xmimo-ui-scope xmimo-tts-plugin-status" role="status">{t('plugin.changing')}</p>
    : <AudioHistoryPage history={history} t={t} volume={voiceVolume} voiceRate={voiceRate} minimalMode={minimalMode} speechActivity={speechActivity}
      beforePlayback={() => {
        if (pluginChanges.getSnapshot()) return false
        audioFocus.claim()
        if (!audioFocus.canPlay()) return false
        previewPlayer.stop()
        beforeHistoryPlayback?.()
        return true
      }} onBack={() => { setHistoryOpen(false) }} />}
  </>

  return <AvatarStyleContext.Provider value={avatarStyle}>{renderHeader?.({ query, onQueryChange: setQuery })}
    <SettingsSearchContext.Provider value={search}>
    <div data-settings-search={search !== null ? '' : undefined} className={minimalMode ? 'xmimo-tts-card xmimo-tts-card-open xmimo-ui-scope xmimo-tts-card-minimal' : 'xmimo-tts-card xmimo-tts-card-open xmimo-ui-scope'}>
      {changing ? <p className="xmimo-tts-plugin-status" role="status">{t('plugin.changing')}</p> : null}
      <div className="xmimo-tts-card-body xmimo-ui-stack">
        {renderHeader ? <div role="status" className="xmimo-tts-search-status">
          {search?.visible.size === 0 ? t('settings.searchEmpty') : null}
        </div> : null}
        {search?.unavailable.length ? <ul className="xmimo-tts-search-unavailable">
          {search.unavailable.map(item => <li key={item.id}><strong>{item.label}</strong><span>{t(item.message)}</span></li>)}
        </ul> : null}
        <SettingsSwitches
          doubaoEnabled={draft.doubaoEnabled}
          breezeEnabled={draft.breezeEnabled}
          deepseekEnabled={draft.deepseekEnabled}
          t={t}
          provider={provider}
          enabled={enabled}
          autoPlay={autoPlay}
          soundEnabled={soundEnabled}
          minimal={minimalMode}
          writable={writable}
          onProviderChange={actions.changeProvider}
          onEnabledChange={actions.changeEnabled}
          onAutoPlayChange={actions.changeAutoPlay}
          onSoundEnabledChange={actions.changeSoundEnabled}
        />
        <SettingsApiKey
          onOpenProviderSettings={onOpenProviderSettings}
          t={t}
          provider={provider}
          value={apiKey}
          message={apiKeyMessage}
          invalid={apiKeyInvalid}
          missing={apiKeyStatus === 'missing'}
          writable={writable}
          minimal={minimalMode}
          onChange={actions.changeApiKey}
        />
        <SettingsDetails
          draft={pickSettings(draft, DETAIL_FIELDS)}
          externalSelection={externalDraft.value}
          onExternalSelectionChange={actions.changeExternal}
          t={t}
          open={openPanel === 'mixer'}
          minimal={minimalMode}
          writable={writable}
          overrides={DETAIL_FIELDS.filter(fieldOverridden)}
          resetField={actions.resetField}
          onChange={actions.update}
          onToggle={actions.toggleMixer}
          onVoiceVolumeChange={actions.changeVoiceVolume}
          onVoiceVolumePreview={actions.previewVoiceVolume}
          onVoiceVolumeCancel={actions.cancelVoiceVolume}
          onVoiceVolumeInteractionEnd={actions.endVoiceVolume}
          onVoiceRateChange={actions.changeVoiceRate}
          onVoiceRateInteractionEnd={actions.endVoiceRate}
          onVoiceDesignPromptChange={actions.changeVoiceDesignPrompt}
          onMossVoiceChange={actions.changeMossVoice}
        />
        <SettingsBroadcast
          t={t}
          writable={writable}
          draft={pickSettings(draft, BROADCAST_FIELDS)}
          externalSelection={externalDraft.value}
          overrides={BROADCAST_FIELDS.filter(fieldOverridden)}
          onSettingChange={actions.update}
          resetField={actions.resetField}
          enabled={!changing}
          open={openPanel === 'broadcast'}
          onToggleOpen={actions.toggleBroadcast}
          status={previewView.status}
          source={previewView.source}
          error={previewView.error}
          text={previewText}
          audioTagProvider={provider === 'breeze' ? 'breeze' : provider === 'xiaomi' && model === 'mimo-v2.5-tts' ? 'xiaomi' : undefined}
          onToggle={actions.togglePreview}
          onTextChange={actions.changePreviewText}
          recording={previewPlayer.getRecording()}
          onSourcesChange={actions.changeAnnouncementSources}
          onSourcesReset={actions.resetAnnouncementSources}
          onQqbotChange={actions.changeQqbotEnabled}
          onAudioResponseStyleChange={actions.changeAudioResponseStyle}
          onAudioResponseStyleReset={actions.resetAudioResponseStyle}
          onAcceptExternalProvidersChange={actions.changeAcceptExternalProviders}
          onMossEnabledChange={actions.changeMossEnabled}
          onProviderEnabledChange={actions.changeProviderEnabled}
        />
        {soundEnabled ? <SettingsSounds
          t={t}
          controller={controller}
          enabled={soundEnabled}
          volume={soundVolume}
          pack={soundPack}
          taskSounds={draft.taskSounds}
          clickSounds={draft.clickSounds}
          writable={writable}
          minimal={minimalMode}
          open={openPanel === 'sound'}
          onToggle={actions.toggleSound}
          onScopeChange={actions.changeSoundScope}
          onVolumeChange={actions.changeSoundVolume}
          onPackChange={actions.changeSoundPack}
        /> : null}
        <div className="xmimo-tts-card-footer">
          <div className="xmimo-tts-card-actions">
            <div className="xmimo-tts-card-action-links">
              {search === null || search.visible.has('sidebar') ? <SidebarSettings t={t} value={snapshot.showInSidebar} disabled={!writable || state === 'saving' || validationError !== null}
                onToggle={() => { void save(!snapshot.showInSidebar) }} /> : null}
              {history && search === null ? <HistoryLink history={history} t={t} buttonRef={historyLinkRef} onOpen={() => {
                previewPlayer.stop()
                setHistoryOpen(true)
              }} /> : null}
              <Button
                type="button"
                variant="toolbar"
                size="sm"
                className="xmimo-tts-mode-toggle"
                hidden={search !== null && !search.visible.has('minimalMode')}
                aria-pressed={minimalMode}
                aria-label={`${t('settings.minimalMode')}: ${t(minimalMode ? 'settings.minimalModeOn' : 'settings.minimalModeOff')}`}
                onClick={actions.toggleMinimalMode}
              >
                <RiSwitchFill size={14} aria-hidden="true" focusable="false" />
                <span className="xmimo-tts-action-label">{t(minimalMode ? 'settings.defaultModeShort' : 'settings.minimalModeShort')}</span>
              </Button>
            </div>
            {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
            {validationError !== null ? <span role="alert" className="xmimo-tts-failed">{t('settings.doubaoVoiceRequired')}</span> : null}
            {state === 'failed' ? <span className="xmimo-tts-failed" role="status">{t(saveError === 'api-key-rejected' ? 'settings.apiKeyUnsupported' : saveError === 'host-rejected' ? 'settings.saveRejected' : saveError === 'provider-count' ? 'settings.providerMinimum' : 'settings.failed')}</span> : null}
            <div className="xmimo-tts-card-action-buttons">
              {state === 'saved' && !dirty ? <span role="status">{t('settings.saved')}</span> : null}
              <Button type="button" variant="outline" size="sm" className="xmimo-tts-discard" disabled={!writable || !dirty || state === 'saving'} onClick={discard}>
                {t('settings.discard')}
              </Button>
              <Button type="button" variant="primary" size="sm" className="xmimo-tts-save" disabled={!writable || !saveableDirty || state === 'saving' || validationError !== null} onClick={() => { void save() }}>
                {state === 'saving' ? t('settings.saving') : t('settings.save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </SettingsSearchContext.Provider>
  </AvatarStyleContext.Provider>
})
