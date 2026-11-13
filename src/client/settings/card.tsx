import { useExternalSelection } from './external-selection.js'
import type { ReactElement, RefObject } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { GoHistory } from 'react-icons/go'
import { RiSwitchFill } from 'react-icons/ri'
import {
  TTS_MIMO_LOGO_ASSET_ROUTE,
  getSoundEffectsModeFlags,
  isSupportedTtsApiKey,
  resolveSoundEffectsScope,
  resolveTtsSettings,
} from '../../shared.js'
import { saveSettingsDraft, validateSettingsDraft, EDITABLE_SETTING_FIELDS, BUILTIN_SETTING_FIELDS, SaveSettingsError } from './save-settings.js'
import { useEngineState } from '../use-engine-state.js'
import { engineStateStore, externalEngine } from '../engine-state.js'
import { invalidateApiKeyStatus, useApiKeyStatus } from '../conversation/api-key-status.js'
import type { TtsSettings, SoundEffectsScope } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { PreviewView } from '../playback/preview-player.js'
import { isRecord, useSettingsSnapshot } from './scope.js'
import { ToggleSoundPlayer } from '../sound-effects/toggle-sound-player.js'
import type { SoundEffectsController } from '../sound-effects/types.js'
import { ApiKeyModule } from './api-key-module.js'
import { resolveApiKeyViewState } from './api-key-state.js'
import { DetailsModule } from './details-module.js'
import { PreviewModule } from './preview-module.js'
import { SoundEffectsPanel } from './sound-effects-module.js'
import { SidebarSettings } from './sidebar-settings.js'
import { withSidebarLoading } from './sidebar-loading.js'
import { SwitchModule } from './switch-module.js'
import { readMinimalMode, writeMinimalMode } from './minimal-mode.js'
import { hostRoute } from '../host-route.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { DraftChanges, EditableSettingField, ResolvedSettings, SettingField, SettingsValues } from './types.js'
import type { AudioHistory } from '../history/audio-history.js'
import { AudioHistoryPage } from '../history/audio-history-page.js'
import { unrestrictedAudioFocus } from '../playback/tab-audio-focus.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { isSpeechBusy } from '../announcements/speech-activity.js'
import type { AudioFocus } from '../playback/tab-audio-focus.js'
import { SettingsSearchContext } from './settings-search-context.js'
import { searchSettings } from './settings-search.js'

export interface SettingsCardProps {
  view: 'summary' | 'page'
  initialPanel?: 'mixer' | undefined
  renderHeader?: (search?: { query: string; onQueryChange: (query: string) => void }) => ReactElement
  onSidebarChange?: ((mounted: boolean) => void) | undefined
  onOpenProviderSettings?: ((bundle: string) => void) | undefined
  scope: ConfigForm<TtsSettings>
  t: Translate
  controller: SoundEffectsController
  beforePreview?: (() => void) | undefined
  beforeHistoryPlayback?: (() => void) | undefined
  changes?: SnapshotSource<boolean> | undefined
  history?: AudioHistory | undefined
  audioFocus?: AudioFocus | undefined
  speechActivity?: SpeechActivity | undefined
}

type DraftSettings = SettingsValues

/** Secret fields map one-to-one to the provider whose key they hold. */
const API_KEY_STATE = {
  apiKey: 'xiaomi',
  doubaoApiKey: 'doubao',
  breezeApiKey: 'breeze',
} as const
type ApiKeyField = keyof typeof API_KEY_STATE
const API_KEY_BY_PROVIDER = {
  xiaomi: 'apiKey',
  doubao: 'doubaoApiKey',
  breeze: 'breezeApiKey',
} as const satisfies Record<typeof API_KEY_STATE[ApiKeyField], ApiKeyField>

function isApiKeyField(field: SettingField): field is ApiKeyField {
  return field in API_KEY_STATE
}

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

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

function SettingsPage({ scope, t, controller, history, speechActivity, beforePreview, beforeHistoryPlayback, initialPanel, renderHeader, onSidebarChange, onOpenProviderSettings, changes: pluginChanges = IDLE_PLUGIN_CHANGES, audioFocus = unrestrictedAudioFocus }: Omit<SettingsCardProps, 'view'>): ReactElement | null {
  useEngineState()
  const external = externalEngine()
  const externalDraft = useExternalSelection(external)
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(pluginChanges.subscribe, pluginChanges.getSnapshot, pluginChanges.getSnapshot)
  const writable = snapshot.writable && !changing
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKeys, setApiKeys] = useState({ xiaomi: '', doubao: '', breeze: '' })
  const [provider, setProvider] = useState(initial.provider)
  const [doubaoModel, setDoubaoModel] = useState(initial.doubaoModel)
  const [doubaoVoice, setDoubaoVoice] = useState(initial.doubaoVoice)
  const [doubaoClonedVoice, setDoubaoClonedVoice] = useState(initial.doubaoClonedVoice)
  const [doubaoInstruction, setDoubaoInstruction] = useState(initial.doubaoInstruction)
  const [doubaoEnabled, setDoubaoEnabled] = useState(initial.doubaoEnabled)
  const [breezeEnabled, setBreezeEnabled] = useState(initial.breezeEnabled)
  const [breezeVoice, setBreezeVoice] = useState(initial.breezeVoice)
  const [breezeInstruction, setBreezeInstruction] = useState(initial.breezeInstruction)
  const [instruction, setInstruction] = useState(initial.instruction)
  const apiKey = apiKeys[provider]
  const apiKeyField = API_KEY_BY_PROVIDER[provider]
  const setApiKey = (next: string): void => { setApiKeys(current => ({ ...current, [provider]: next })) }
  const [showInSidebar, setShowInSidebar] = useState(initial.showInSidebar)
  const [showInHostSettings, setShowInHostSettings] = useState(initial.showInHostSettings)
  const [showFeatureGuide, setShowFeatureGuide] = useState(initial.showFeatureGuide)
  const [acceptExternalProviders, setAcceptExternalProviders] = useState(initial.acceptExternalProviders)
  const [voiceRecognitionService, setVoiceRecognitionService] = useState(initial.voiceRecognitionService)
  const [announcementSources, setAnnouncementSources] = useState(initial.announcementSources)
  const [qqbotEnabled, setQqbotEnabled] = useState(initial.qqbotEnabled)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [showReadingCaptions, setShowReadingCaptions] = useState(initial.showReadingCaptions)
  const [voiceInputCompatibility, setVoiceInputCompatibility] = useState(initial.voiceInputCompatibility)
  const [inputAvoidance, setInputAvoidance] = useState(initial.inputAvoidance)
  const [importantAnnouncementsFirst, setImportantAnnouncementsFirst] = useState(initial.importantAnnouncementsFirst)
  const [voiceVolume, setVoiceVolume] = useState(initial.voiceVolume)
  const [voiceRate, setVoiceRate] = useState(initial.voiceRate)
  const [readScope, setReadScope] = useState(initial.readScope)
  const [model, setModel] = useState(initial.model)
  const [localSpeechMode, setLocalSpeechMode] = useState(initial.localSpeechMode)
  const [localVoiceURI, setLocalVoiceURI] = useState(initial.localVoiceURI)
  const [localVoiceEngine, setLocalVoiceEngine] = useState(initial.localVoiceEngine)
  const [mossEnabled, setMossEnabled] = useState(initial.mossEnabled)
  const [mossBaseURL, setMossBaseURL] = useState(initial.mossBaseURL)
  const [mossVoice, setMossVoice] = useState(initial.mossVoice)
  const [mossVoiceName, setMossVoiceName] = useState(initial.mossVoiceName)
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
  const [saveError, setSaveError] = useState<'api-key-rejected' | 'host-rejected' | 'unknown' | null>(null)
  const saveInFlight = useRef(false)
  const [openPanel, setOpenPanel] = useState<'mixer' | 'sound' | 'broadcast' | null>(initialPanel ?? null)
  const togglePanel = (panel: 'mixer' | 'sound' | 'broadcast'): void => setOpenPanel(current => current === panel ? null : panel)
  const [query, setQuery] = useState('')
  const search = renderHeader ? searchSettings(query, t, {
    provider, externalName: external?.name, voiceDesign: model === 'mimo-v2.5-tts-voicedesign',
    doubaoClone: doubaoModel === 'seed-icl-2.0', soundEnabled, mossEnabled, mossSelected: mossEnabled && localVoiceEngine === 'moss',
  }) : null
  const [previewText, setPreviewText] = useState(() => t('settings.previewDefaultText'))
  const [previewView, setPreviewView] = useState<PreviewView>({ status: 'idle', source: null, error: null })
  const [previewPlayer] = useState(() => new PreviewPlayer(setPreviewView, history))
  useEffect(() => engineStateStore.subscribe(() => previewPlayer.stop()), [previewPlayer])
  useEffect(() => speechActivity?.register(() => isSpeechBusy(previewPlayer.getView().status), () => previewPlayer.stop()), [speechActivity, previewPlayer])
  const [toggleSoundPlayer] = useState(() => new ToggleSoundPlayer())
  useEffect(() => audioFocus.subscribe(() => {
    if (audioFocus.canPlay()) return
    previewPlayer.stop()
    toggleSoundPlayer.dispose()
  }), [audioFocus, previewPlayer, toggleSoundPlayer])
  const apiKeyStatus = useApiKeyStatus(snapshot.status === 'ready' && !changing, provider)
  const [minimalMode, setMinimalMode] = useState(readMinimalMode)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyLinkRef = useRef<HTMLButtonElement>(null)
  const historyWasOpen = useRef(false)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { showInSidebar, showInHostSettings, showFeatureGuide, acceptExternalProviders, voiceRecognitionService, qqbotEnabled, announcementSources, provider, doubaoModel, doubaoVoice, doubaoClonedVoice, doubaoInstruction, doubaoEnabled, breezeEnabled, breezeVoice, breezeInstruction, instruction, enabled, autoPlay: enabled && autoPlay, showReadingCaptions, voiceInputCompatibility, inputAvoidance, importantAnnouncementsFirst, voiceVolume, voiceRate, readScope, model, localSpeechMode, localVoiceURI, localVoiceEngine, mossEnabled, mossBaseURL, mossVoice, mossVoiceName, voice, voiceDesignPrompt, voiceDesignCustomPrompt, soundEnabled, soundVolume, soundPack, taskSounds, clickSounds }
  const acceptedValue = (field: EditableSettingField): ResolvedSettings[typeof field] => {
    const raw = value?.[field]
    return (raw === undefined ? accepted[field] : raw) as ResolvedSettings[typeof field]
  }
  const hasOverride = (field: SettingField): boolean => hasLayerField(snapshot.user, field)
  const fieldOverridden = (field: SettingField): boolean => {
    const change = changes[field]
    if (change?.kind === 'clear') return false
    if (change?.kind === 'set') return isApiKeyField(field) ? apiKeys[API_KEY_STATE[field]].trim().length > 0 : true
    return hasOverride(field)
  }
  const fieldDirty = (field: EditableSettingField): boolean => {
    const change = changes[field]
    if (change === undefined) return false
    if (change.kind === 'clear') return hasOverride(field)
    return Array.isArray(draft[field]) ? JSON.stringify(draft[field]) !== JSON.stringify(acceptedValue(field)) : !Object.is(draft[field], acceptedValue(field))
  }
  const apiKeyDirty = (Object.keys(API_KEY_STATE) as ApiKeyField[]).some(field => changes[field]?.kind === 'set' && apiKeys[API_KEY_STATE[field]].trim().length > 0)
  const dirty = EDITABLE_SETTING_FIELDS.some(fieldDirty) || apiKeyDirty || externalDraft.dirty
  const validationError = external ? null : validateSettingsDraft(draft)
  const saveableDirty = external ? externalDraft.dirty || EDITABLE_SETTING_FIELDS.some(field => !BUILTIN_SETTING_FIELDS.has(field) && fieldDirty(field)) : dirty
  const apiKeyViewState = resolveApiKeyViewState(apiKey, isSupportedTtsApiKey(apiKey, provider), apiKeyStatus, changes[apiKeyField]?.kind)
  const apiKeyMessage = t(apiKeyViewState === 'loading'
    ? 'settings.apiKeyLoading'
    : apiKeyViewState === 'missing'
      ? 'settings.apiKeyMissing'
      : apiKeyViewState === 'recognized'
        ? provider === 'doubao' ? 'settings.doubaoKeyConfigured' : 'settings.apiKeyRecognized'
        : apiKeyViewState === 'unrecognized'
          ? 'settings.apiKeyUnsupportedSaved'
          : apiKeyViewState === 'unavailable'
            ? 'settings.apiKeyUnavailable'
            : apiKeyViewState === 'pending-save'
              ? 'settings.apiKeyPendingSave'
              : 'settings.apiKeyUnsupported')
  const apiKeyInvalid = apiKeyViewState === 'pending-invalid' || apiKeyViewState === 'unrecognized'

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setProvider(next.provider)
    setDoubaoModel(next.doubaoModel)
    setDoubaoVoice(next.doubaoVoice)
    setDoubaoClonedVoice(next.doubaoClonedVoice)
    setDoubaoInstruction(next.doubaoInstruction)
    setDoubaoEnabled(next.doubaoEnabled)
    setBreezeEnabled(next.breezeEnabled)
    setBreezeVoice(next.breezeVoice)
    setBreezeInstruction(next.breezeInstruction)
    setInstruction(next.instruction)
    setShowInSidebar(next.showInSidebar)
    setShowInHostSettings(next.showInHostSettings)
    setShowFeatureGuide(next.showFeatureGuide)
    setAcceptExternalProviders(next.acceptExternalProviders)
    setVoiceRecognitionService(next.voiceRecognitionService)
    setAnnouncementSources(next.announcementSources)
    setQqbotEnabled(next.qqbotEnabled)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setShowReadingCaptions(next.showReadingCaptions)
    setVoiceInputCompatibility(next.voiceInputCompatibility)
    setInputAvoidance(next.inputAvoidance)
    setImportantAnnouncementsFirst(next.importantAnnouncementsFirst)
    setVoiceVolume(next.voiceVolume)
    setVoiceRate(next.voiceRate)
    setReadScope(next.readScope)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setLocalVoiceEngine(next.localVoiceEngine)
    setMossEnabled(next.mossEnabled)
    setMossBaseURL(next.mossBaseURL)
    setMossVoice(next.mossVoice)
    setMossVoiceName(next.mossVoiceName)
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

  useEffect(() => { toggleSoundPlayer.setEnabled(!minimalMode) }, [minimalMode, toggleSoundPlayer])

  useEffect(() => {
    controller.update({ enabled: soundEnabled, volume: soundVolume, pack: soundPack, taskSounds, clickSounds })
  }, [clickSounds, controller, soundEnabled, soundPack, soundVolume, taskSounds])

  useEffect(() => { previewPlayer.setVolume(voiceVolume); toggleSoundPlayer.setVolume(voiceVolume) }, [previewPlayer, toggleSoundPlayer, voiceVolume])

  useEffect(() => {
    if (!historyOpen && historyWasOpen.current) historyLinkRef.current?.focus({ preventScroll: true })
    historyWasOpen.current = historyOpen
  }, [historyOpen])

  if (snapshot.status === 'unavailable') return renderHeader?.() ?? null

  const markChange = (field: SettingField): void => {
    setChanges((current) => ({ ...current, [field]: { kind: 'set' } }))
    setState('idle')
    setSaveError(null)
  }

  const resetField = (field: EditableSettingField): void => {
    previewPlayer.stop()
    setChanges((current) => ({ ...current, [field]: { kind: 'clear' } }))
    setState('idle')
    if (field === 'provider') setProvider((base.provider === 'doubao' && !doubaoEnabled) || (base.provider === 'breeze' && !breezeEnabled) ? 'xiaomi' : base.provider)
    if (field === 'doubaoModel') setDoubaoModel(base.doubaoModel)
    if (field === 'doubaoVoice') setDoubaoVoice(base.doubaoVoice)
    if (field === 'doubaoClonedVoice') setDoubaoClonedVoice(base.doubaoClonedVoice)
    if (field === 'doubaoInstruction') setDoubaoInstruction(base.doubaoInstruction)
    if (field === 'breezeVoice') setBreezeVoice(base.breezeVoice)
    if (field === 'breezeInstruction') setBreezeInstruction(base.breezeInstruction)
    if (field === 'instruction') setInstruction(base.instruction)
    if (field === 'showInSidebar') setShowInSidebar(base.showInSidebar)
    if (field === 'showInHostSettings') setShowInHostSettings(base.showInHostSettings)
    if (field === 'showFeatureGuide') setShowFeatureGuide(base.showFeatureGuide)
    if (field === 'acceptExternalProviders') setAcceptExternalProviders(base.acceptExternalProviders)
    if (field === 'voiceRecognitionService') setVoiceRecognitionService(base.voiceRecognitionService)
    if (field === 'announcementSources') setAnnouncementSources(base.announcementSources)
    if (field === 'qqbotEnabled') setQqbotEnabled(base.qqbotEnabled)
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'showReadingCaptions') setShowReadingCaptions(base.showReadingCaptions)
    if (field === 'voiceInputCompatibility') setVoiceInputCompatibility(base.voiceInputCompatibility)
    if (field === 'inputAvoidance') setInputAvoidance(base.inputAvoidance)
    if (field === 'importantAnnouncementsFirst') setImportantAnnouncementsFirst(base.importantAnnouncementsFirst)
    if (field === 'voiceVolume') setVoiceVolume(base.voiceVolume)
    if (field === 'voiceRate') setVoiceRate(base.voiceRate)
    if (field === 'readScope') setReadScope(base.readScope)
    if (field === 'model') setModel(base.model)
    if (field === 'localSpeechMode') setLocalSpeechMode(base.localSpeechMode)
    if (field === 'localVoiceURI') setLocalVoiceURI(base.localVoiceURI)
    if (field === 'localVoiceEngine') setLocalVoiceEngine(!mossEnabled ? 'browser' : base.localVoiceEngine)
    if (field === 'mossEnabled') {
      setMossEnabled(base.mossEnabled)
      if (!base.mossEnabled && localVoiceEngine === 'moss') {
        setLocalVoiceEngine('browser')
        setChanges(current => ({ ...current, localVoiceEngine: { kind: 'set' } }))
      }
    }
    if (field === 'mossBaseURL') setMossBaseURL(base.mossBaseURL)
    if (field === 'mossVoice') setMossVoice(base.mossVoice)
    if (field === 'mossVoiceName') setMossVoiceName(base.mossVoiceName)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'voiceDesignPrompt') setVoiceDesignPrompt(base.voiceDesignPrompt)
    if (field === 'voiceDesignCustomPrompt') setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt)
    if (field === 'soundEnabled') setSoundEnabled(base.soundEnabled)
    if (field === 'soundVolume') setSoundVolume(base.soundVolume)
    if (field === 'soundPack') setSoundPack(base.soundPack)
    if (field === 'taskSounds') setTaskSounds(base.taskSounds)
    if (field === 'clickSounds') setClickSounds(base.clickSounds)
  }

  const discard = (): void => {
    externalDraft.discard()
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setProvider(next.provider)
    setDoubaoModel(next.doubaoModel)
    setDoubaoVoice(next.doubaoVoice)
    setDoubaoClonedVoice(next.doubaoClonedVoice)
    setDoubaoInstruction(next.doubaoInstruction)
    setDoubaoEnabled(next.doubaoEnabled)
    setBreezeEnabled(next.breezeEnabled)
    setBreezeVoice(next.breezeVoice)
    setBreezeInstruction(next.breezeInstruction)
    setInstruction(next.instruction)
    setShowInSidebar(next.showInSidebar)
    setShowInHostSettings(next.showInHostSettings)
    setShowFeatureGuide(next.showFeatureGuide)
    setAcceptExternalProviders(next.acceptExternalProviders)
    setVoiceRecognitionService(next.voiceRecognitionService)
    setAnnouncementSources(next.announcementSources)
    setQqbotEnabled(next.qqbotEnabled)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setShowReadingCaptions(next.showReadingCaptions)
    setVoiceInputCompatibility(next.voiceInputCompatibility)
    setInputAvoidance(next.inputAvoidance)
    setImportantAnnouncementsFirst(next.importantAnnouncementsFirst)
    setVoiceVolume(next.voiceVolume)
    setVoiceRate(next.voiceRate)
    setReadScope(next.readScope)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setLocalVoiceEngine(next.localVoiceEngine)
    setMossEnabled(next.mossEnabled)
    setMossBaseURL(next.mossBaseURL)
    setMossVoice(next.mossVoice)
    setMossVoiceName(next.mossVoiceName)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setSoundEnabled(next.soundEnabled)
    setSoundVolume(next.soundVolume)
    setSoundPack(next.soundPack)
    setTaskSounds(next.taskSounds)
    setClickSounds(next.clickSounds)
    setApiKeys({ xiaomi: '', doubao: '', breeze: '' })
    previewPlayer.stop()
    setChanges({})
    setState('idle')
  }

  const save = async (sidebar?: boolean): Promise<void> => {
    if (!writable || pluginChanges.getSnapshot() || saveInFlight.current) return
    saveInFlight.current = true
    setOpenPanel(null)
    setState('saving')
    setSaveError(null)
    try {
      const commit = async (): Promise<void> => {
        const nextDraft = sidebar === undefined ? draft : { ...draft, showInSidebar: sidebar }
        const nextChanges: DraftChanges = sidebar === undefined ? changes : { ...changes, showInSidebar: { kind: 'set' } }
        await externalDraft.save()
        await saveSettingsDraft(scope, nextDraft, nextChanges, apiKeys, external !== null)
        if (changes.apiKey !== undefined || changes.doubaoApiKey !== undefined || changes.breezeApiKey !== undefined) invalidateApiKeyStatus()
        if (!external) setApiKeys({ xiaomi: '', doubao: '', breeze: '' })
        setChanges(external ? Object.fromEntries(Object.entries(changes).filter(([field]) => BUILTIN_SETTING_FIELDS.has(field))) : {})
        setState('saved')
        if (sidebar !== undefined) onSidebarChange?.(sidebar)
      }
      if (sidebar === undefined) await commit()
      else await withSidebarLoading(sidebar, t, commit)
    } catch (error) {
      const code = error instanceof SaveSettingsError ? error.code : null
      setSaveError(code === 'api-key-rejected' ? 'api-key-rejected' : code === 'host-rejected' ? 'host-rejected' : 'unknown')
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
    if (validationError !== null || (!external && changes[apiKeyField] !== undefined)) {
      previewPlayer.stop()
      setPreviewView({ status: 'error', source: provider === 'doubao' ? 'doubao' : provider === 'breeze' ? 'breeze' : 'mimo', error: validationError !== null ? 'voice-required' : 'save-key-first' })
      return
    }
    beforePreview?.()
    void previewPlayer.play(text, { ...draft, ...(external ? { externalSelection: externalDraft.value } : {}) })
  }

  const toggleSettingsPreview = (): void => { togglePreview(previewText) }

  const changeEnabled = (next: boolean): void => {
    if (minimalMode && soundEnabled && clickSounds) controller.play(next ? 'toggle-on' : 'toggle-off')
    else if (audioFocus.canPlay()) toggleSoundPlayer.schedule(next ? 'on' : 'off')
    setEnabled(next)
    if (!next) {
      setAutoPlay(false)
      setChanges((current) => ({ ...current, enabled: { kind: 'set' }, autoPlay: { kind: 'set' } }))
    } else {
      markChange('enabled')
    }
    setState('idle')
  }

  const changeAutoPlay = (next: boolean): void => {
    if (minimalMode && soundEnabled && clickSounds) controller.play(next ? 'toggle-on' : 'toggle-off')
    else if (audioFocus.canPlay()) toggleSoundPlayer.schedule(next ? 'auto-on' : 'auto-off')
    setAutoPlay(next)
    if (next) {
      setEnabled(true)
      setChanges((current) => ({ ...current, autoPlay: { kind: 'set' }, enabled: { kind: 'set' } }))
    } else {
      markChange('autoPlay')
    }
    setState('idle')
  }

  const changeProvider = (next: typeof provider): void => {
    if (soundEnabled && clickSounds) controller.play('select')
    previewPlayer.stop()
    setProvider(next)
    markChange('provider')
  }

  const changeSoundScope = (scope: SoundEffectsScope): void => {
    const flags = getSoundEffectsModeFlags(scope)
    controller.update({ enabled: soundEnabled, taskSounds: flags.taskSounds, clickSounds: flags.clickSounds, volume: soundVolume, pack: soundPack })
    setTaskSounds(flags.taskSounds)
    setClickSounds(flags.clickSounds)
    setChanges(current => ({ ...current, taskSounds: { kind: 'set' }, clickSounds: { kind: 'set' } }))
    setState('idle')
  }

  const changeSoundEnabled = (next: boolean): void => {
    const flags = getSoundEffectsModeFlags(resolveSoundEffectsScope(taskSounds, clickSounds))
    if (!next && soundEnabled && clickSounds) controller.play('toggle-off')
    controller.update({ enabled: next, taskSounds: flags.taskSounds, clickSounds: flags.clickSounds, volume: soundVolume, pack: soundPack })
    if (next && flags.clickSounds) controller.play('toggle-on')
    setSoundEnabled(next)
    setTaskSounds(flags.taskSounds)
    setClickSounds(flags.clickSounds)
    setChanges(current => ({ ...current, soundEnabled: { kind: 'set' }, taskSounds: { kind: 'set' }, clickSounds: { kind: 'set' } }))
    setState('idle')
  }

  const toggleMinimalMode = (): void => {
    const next = !minimalMode
    setMinimalMode(next)
    writeMinimalMode(next)
    toggleSoundPlayer.setEnabled(!next)
    if (next) previewPlayer.stop()
  }

  if (historyOpen && history) return <>{renderHeader?.()}
    {changing ? <p className="xmimo-ui-scope xmimo-tts-plugin-status" role="status">{t('plugin.changing')}</p>
    : <AudioHistoryPage history={history} t={t} volume={voiceVolume} voiceRate={voiceRate} minimalMode={minimalMode} speechActivity={speechActivity}
      beforePlayback={() => {
        if (pluginChanges.getSnapshot()) return false
        audioFocus.claim()
        if (!audioFocus.canPlay()) return false
        previewPlayer.stop()
        toggleSoundPlayer.dispose()
        beforeHistoryPlayback?.()
        return true
      }} onBack={() => { setHistoryOpen(false) }} />}
  </>

  return <>{renderHeader?.({ query, onQueryChange: setQuery })}
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
        <SwitchModule
          doubaoEnabled={doubaoEnabled}
          breezeEnabled={breezeEnabled}
          t={t}
          provider={provider}
          enabled={enabled}
          autoPlay={autoPlay}
          soundEnabled={soundEnabled}
          minimal={minimalMode}
          writable={writable}
          onProviderChange={changeProvider}
          onEnabledChange={changeEnabled}
          onAutoPlayChange={changeAutoPlay}
          onSoundEnabledChange={changeSoundEnabled}
        />
        <ApiKeyModule
          onOpenProviderSettings={onOpenProviderSettings}
          t={t}
          provider={provider}
          value={apiKey}
          message={apiKeyMessage}
          invalid={apiKeyInvalid}
          writable={writable}
          minimal={minimalMode}
          onChange={(next) => { setApiKey(next); markChange(apiKeyField) }}
        />
        <DetailsModule
          externalSelection={externalDraft.value}
          onExternalSelectionChange={next => { previewPlayer.stop(); externalDraft.change(next); setState('idle') }}
          t={t}
          provider={provider}
          doubaoModel={doubaoModel}
          doubaoVoice={doubaoVoice}
          doubaoClonedVoice={doubaoClonedVoice}
          breezeVoice={breezeVoice}
          breezeInstruction={breezeInstruction}
          speechInstruction={provider === 'doubao' ? doubaoInstruction : instruction}
          onSpeechInstructionChange={next => {
            previewPlayer.stop()
            if (provider === 'doubao') { setDoubaoInstruction(next); markChange('doubaoInstruction') }
            else { setInstruction(next); markChange('instruction') }
          }}
          onDoubaoModelChange={next => { previewPlayer.stop(); setDoubaoModel(next); markChange('doubaoModel') }}
          onDoubaoVoiceChange={next => { previewPlayer.stop(); setDoubaoVoice(next); markChange('doubaoVoice') }}
          onDoubaoClonedVoiceChange={next => { previewPlayer.stop(); setDoubaoClonedVoice(next); markChange('doubaoClonedVoice') }}
          onBreezeVoiceChange={(next: string) => { previewPlayer.stop(); setBreezeVoice(next); markChange('breezeVoice') }}
          onBreezeInstructionChange={(next: string) => { previewPlayer.stop(); setBreezeInstruction(next); markChange('breezeInstruction') }}
          open={openPanel === 'mixer'}
          minimal={minimalMode}
          writable={writable}
          autoPlay={autoPlay}
          voiceVolume={voiceVolume}
          voiceRate={voiceRate}
          readScope={readScope}
          model={model}
          localSpeechMode={localSpeechMode}
          localVoiceURI={localVoiceURI}
          localVoiceEngine={localVoiceEngine}
          mossEnabled={mossEnabled}
          mossBaseURL={mossBaseURL}
          mossVoice={mossVoice}
          mossVoiceName={mossVoiceName}
          voice={voice}
          voiceDesignPrompt={voiceDesignPrompt}
          voiceDesignCustomPrompt={voiceDesignCustomPrompt}
          fieldOverridden={fieldOverridden}
          resetField={resetField}
          onToggle={() => togglePanel('mixer')}
          onVoiceVolumeChange={(next) => { previewPlayer.setVolume(next); toggleSoundPlayer.setPreviewVolume(next); setVoiceVolume(next); markChange('voiceVolume') }}
          onVoiceVolumeInteractionEnd={(next) => { if (!audioFocus.canPlay()) return; if (minimalMode) controller.previewVolume(); else toggleSoundPlayer.previewVolume(next) }}
          onVoiceRateChange={(next) => { setVoiceRate(next); markChange('voiceRate') }}
          onVoiceRateInteractionEnd={(next) => { controller.play('success', { playbackRate: next }) }}
          onReadScopeChange={(next) => { setReadScope(next); markChange('readScope') }}
          onModelChange={(nextModel) => { previewPlayer.stop(); setModel(nextModel); markChange('model') }}
          onVoiceDesignPromptChange={(next) => {
            setVoiceDesignPrompt(next)
            setVoiceDesignCustomPrompt(next)
            setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
            setState('idle')
          }}
          onVoiceChange={(next) => { previewPlayer.stop(); setVoice(next); markChange('voice') }}
          onLocalVoiceURIChange={(next) => { setLocalVoiceURI(next); markChange('localVoiceURI') }}
          onLocalVoiceEngineChange={(next) => { setLocalVoiceEngine(next); markChange('localVoiceEngine') }}
          onMossBaseURLChange={(next) => { setMossBaseURL(next); markChange('mossBaseURL') }}
          onMossVoiceChange={(voiceId, voiceName) => {
            setMossVoice(voiceId)
            setMossVoiceName(voiceName)
            setChanges((current) => ({ ...current, mossVoice: { kind: 'set' }, mossVoiceName: { kind: 'set' } }))
            setState('idle')
          }}
          onLocalSpeechModeChange={(next) => { setLocalSpeechMode(next); markChange('localSpeechMode') }}
        />
        <PreviewModule
          externalSelection={externalDraft.value}
          mossEnabled={mossEnabled}
          onMossEnabledChange={next => {
            previewPlayer.stop()
            setMossEnabled(next)
            const switchToBrowser = !next && localVoiceEngine === 'moss'
            if (switchToBrowser) setLocalVoiceEngine('browser')
            setChanges(current => ({ ...current, mossEnabled: { kind: 'set' }, ...(switchToBrowser ? { localVoiceEngine: { kind: 'set' } as const } : {}) }))
            setState('idle')
          }}
          doubaoEnabled={doubaoEnabled}
          breezeEnabled={breezeEnabled}
          onProviderEnabledChange={(target, next) => {
            if (!next && (target === 'doubao' ? !breezeEnabled : !doubaoEnabled)) return
            previewPlayer.stop()
            if (target === 'doubao') setDoubaoEnabled(next)
            else setBreezeEnabled(next)
            const switchToXiaomi = !next && provider === target
            if (switchToXiaomi) setProvider('xiaomi')
            setChanges(current => ({ ...current, [target === 'doubao' ? 'doubaoEnabled' : 'breezeEnabled']: { kind: 'set' }, ...(switchToXiaomi ? { provider: { kind: 'set' } as const } : {}) }))
            setState('idle')
          }}
          t={t}
          enabled={!changing}
          open={openPanel === 'broadcast'}
          onToggleOpen={() => togglePanel('broadcast')}
          status={previewView.status}
          source={previewView.source}
          error={previewView.error}
          text={previewText}
          audioTagProvider={provider === 'breeze' ? 'breeze' : provider === 'xiaomi' && model === 'mimo-v2.5-tts' ? 'xiaomi' : undefined}
          onToggle={toggleSettingsPreview}
          onTextChange={next => { previewPlayer.stop(); setPreviewText(next) }}
          recording={previewPlayer.getRecording()}
          showInHostSettings={showInHostSettings}
          showFeatureGuide={showFeatureGuide}
          onShowFeatureGuideChange={next => { setShowFeatureGuide(next); markChange('showFeatureGuide') }}
          showFeatureGuideOverridden={fieldOverridden('showFeatureGuide')}
          onShowFeatureGuideReset={() => resetField('showFeatureGuide')}
          acceptExternalProviders={acceptExternalProviders}
          onAcceptExternalProvidersChange={next => { setAcceptExternalProviders(next); markChange('acceptExternalProviders') }}
          acceptExternalProvidersOverridden={fieldOverridden('acceptExternalProviders')}
          onAcceptExternalProvidersReset={() => resetField('acceptExternalProviders')}
          voiceRecognitionService={voiceRecognitionService}
          onVoiceRecognitionServiceChange={next => { setVoiceRecognitionService(next); markChange('voiceRecognitionService') }}
          voiceRecognitionServiceOverridden={fieldOverridden('voiceRecognitionService')}
          onVoiceRecognitionServiceReset={() => resetField('voiceRecognitionService')}
          onShowInHostSettingsChange={next => { setShowInHostSettings(next); markChange('showInHostSettings') }}
          showInHostSettingsOverridden={fieldOverridden('showInHostSettings')}
          onShowInHostSettingsReset={() => resetField('showInHostSettings')}
          showReadingCaptions={showReadingCaptions}
          onShowReadingCaptionsChange={next => { setShowReadingCaptions(next); markChange('showReadingCaptions') }}
          showReadingCaptionsOverridden={fieldOverridden('showReadingCaptions')}
          onShowReadingCaptionsReset={() => resetField('showReadingCaptions')}
          inputAvoidance={inputAvoidance}
          onInputAvoidanceChange={next => { setInputAvoidance(next); markChange('inputAvoidance') }}
          inputAvoidanceOverridden={fieldOverridden('inputAvoidance')}
          onInputAvoidanceReset={() => resetField('inputAvoidance')}
          importantAnnouncementsFirst={importantAnnouncementsFirst}
          onImportantAnnouncementsFirstChange={next => { setImportantAnnouncementsFirst(next); markChange('importantAnnouncementsFirst') }}
          importantAnnouncementsFirstOverridden={fieldOverridden('importantAnnouncementsFirst')}
          onImportantAnnouncementsFirstReset={() => resetField('importantAnnouncementsFirst')}
          voiceInputCompatibility={voiceInputCompatibility}
          onVoiceInputCompatibilityChange={next => { setVoiceInputCompatibility(next); markChange('voiceInputCompatibility') }}
          voiceInputCompatibilityOverridden={fieldOverridden('voiceInputCompatibility')}
          onVoiceInputCompatibilityReset={() => resetField('voiceInputCompatibility')}
          sources={announcementSources}
          qqbotEnabled={qqbotEnabled}
          onQqbotChange={next => { setQqbotEnabled(next); markChange('qqbotEnabled') }}
          writable={writable}
          overridden={fieldOverridden('announcementSources')}
          onReset={() => resetField('announcementSources')}
          onChange={next => { setAnnouncementSources(next); markChange('announcementSources') }}
        />
        {soundEnabled ? <SoundEffectsPanel
          t={t}
          controller={controller}
          enabled={soundEnabled}
          volume={soundVolume}
          pack={soundPack}
          taskSounds={taskSounds}
          clickSounds={clickSounds}
          writable={writable}
          minimal={minimalMode}
          open={openPanel === 'sound'}
          onToggle={() => togglePanel('sound')}
          onScopeChange={changeSoundScope}
          onVolumeChange={(next) => { setSoundVolume(next); markChange('soundVolume') }}
          onPackChange={(next) => { setSoundPack(next); markChange('soundPack') }}
        /> : null}
        <div className="xmimo-tts-card-footer">
          <div className="xmimo-tts-card-actions">
            <div className="xmimo-tts-card-action-links">
              {search === null || search.visible.has('sidebar') ? <SidebarSettings t={t} value={accepted.showInSidebar} disabled={!writable || state === 'saving' || validationError !== null}
                onToggle={() => { void save(!accepted.showInSidebar) }} /> : null}
              {history && search === null ? <HistoryLink history={history} t={t} buttonRef={historyLinkRef} onOpen={() => {
                previewPlayer.stop()
                toggleSoundPlayer.dispose()
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
                onClick={toggleMinimalMode}
              >
                <RiSwitchFill size={14} aria-hidden="true" focusable="false" />
                <span className="xmimo-tts-action-label">{t(minimalMode ? 'settings.defaultModeShort' : 'settings.minimalModeShort')}</span>
              </Button>
            </div>
            {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
            {validationError !== null ? <span role="alert" className="xmimo-tts-failed">{t('settings.doubaoVoiceRequired')}</span> : null}
            {state === 'failed' ? <span className="xmimo-tts-failed" role="status">{t(saveError === 'api-key-rejected' ? 'settings.apiKeyUnsupported' : saveError === 'host-rejected' ? 'settings.saveRejected' : 'settings.failed')}</span> : null}
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
  </>
}
