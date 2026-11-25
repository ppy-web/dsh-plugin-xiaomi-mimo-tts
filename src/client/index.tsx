import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TTS_SETTINGS_NAMESPACE, resolveTtsSettings, ttsSelectionKey } from './shared.js'
import type { TtsSettings } from './shared.js'
import { AutomaticReading } from './conversation/automatic-reading.js'
import { ReadAloudAction } from './conversation/read-aloud.js'
import { SessionPlaybackObserver } from './conversation/session-playback-observer.js'
import { ReadingCaptionBar } from './conversation/reading-caption-bar.js'
import { NS, en, zh } from './localization.js'
import type { Translate } from './localization.js'
import { LiveSpeechController, LocalSpeechController, PlaybackController } from './playback/index.js'
import { XiaomiMimoTtsPcmService } from './playback/pcm-play-service.js'
import { ReadingCaptions } from './playback/reading-captions.js'
import { registerBundleSettings } from './settings/bundle-settings.js'
import { observeSettingsSlice, resolvedSettingsSnapshot } from './settings/scope.js'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { registerWhalePersonaSettings, registerQqbotSpeechSettings } from './settings/qqbot-registration.js'
import { registerPassportSettings } from './settings/passport-registration.js'
import { apiKeyStatusStore, bindApiKeyStatus } from './settings/api-key-status-store.js'
import { engineStateStore } from './engine-state.js'
import { PluginDetailActions, PluginDetailBadge } from './settings/plugin-detail.js'
import type { ActivationGuideProps } from './settings/activation-guide.js'
import { lazyPanel } from './lazy-panel.js'
import { PluginAudioFocus, observePluginActivity } from './plugin-activity.js'
import { VoiceInputActivity } from './voice-input-activity.js'
import { registerVoiceReadingNavIcon } from './settings/nav-icon.js'
import { observeHostSettingsEntry } from './settings/host-settings-entry.js'
import { openVoiceWorkbench, registerVoiceSettingsSidebar, VOICE_SETTINGS_PANEL_ID } from './settings/sidebar-action.js'
import { VoiceReadingSection } from './settings/voice-reading-section.js'
import type { VoiceReadingSectionInjected } from './settings/voice-reading-section.js'
import { createSoundEffectsController, installClickSounds } from './sound-effects/index.js'
import { installTaskSoundWatcher } from './sound-effects/task-watcher.js'
import { CORE_CLIENT_STYLES } from './style/core.js'
import { disposePersistentClientStyles, ensureClientStyle } from './style/inject.js'

const ActivationGuide = lazyPanel<ActivationGuideProps>(() => import('./settings/activation-guide.js').then(module => module.ActivationGuide), { silentLoading: true })
import { AudioHistory } from './history/audio-history.js'
import { TabAudioFocus } from './playback/tab-audio-focus.js'
import { SpeechActivity, isSpeechBusy } from './announcements/speech-activity.js'
import { AnnouncementManager } from './announcements/manager.js'
import { AnnouncementPlayback } from './announcements/playback.js'
import { DshPetCollector } from './announcements/dsh-pet.js'
import { QuestionTitleCollector } from './announcements/question-titles.js'
import { QuestionTitlePlayback } from './announcements/question-playback.js'
import { hostCollector } from './announcements/host-source.js'
import { observeApprovals } from './announcements/approvals.js'
import { observeJobs, type AnnouncementJobs } from './announcements/jobs.js'
import { observeSubagents } from './announcements/subagents.js'

/** Client services required by this plugin. */
export const inject = [
  'slots',
  'locale',
  'remote',
  'configForms',
  'pluginNavigation',
  'layout',
  'pluginChanges',
  'sessions',
  'uiConversation',
]

function formatStartupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerSlotContribution(
  ctx: Context,
  name: 'conversation.input.dock' | 'conversation.chat.assistant-actions' | 'plugins.bundle.config' | 'plugins.row.config' | 'settings.section' | 'sidebar.panellist' | 'settings.section.icon' | 'plugins.bundle.activation' | 'plugins.detail.actions' | 'plugins.detail.badge',
  register: () => (() => void) | Iterable<() => void>,
): void {
  ctx.effect(() => {
    try {
      ctx.slots.inject(name, () => {
        try {
          return register()
        } catch (error) {
          ctx.logger.error(`dsh-xiaomi-tts: ${name} contribution disabled: ${formatStartupError(error)}`)
          return () => {}
        }
      })
    } catch (error) {
      ctx.logger.error(`dsh-xiaomi-tts: ${name} injection disabled: ${formatStartupError(error)}`)
    }
    return () => {}
  }, `xiaomi-mimo-tts: ${name}`)
}

/** Register the Web action, settings card, Voice reading section, locale dictionaries, and styles. */
export function apply(ctx: Context): void {
  console.info('[dsh-xiaomi-tts] client loaded')
  const locale = ctx.locale as unknown as {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: Record<string, typeof en>): () => void
    subscribe(listener: () => void): () => void
    getSnapshot(): { revision: number }
  }
  const t = locale.bind(NS)
  const localeRevision = { subscribe: (listener: () => void) => locale.subscribe(listener), getSnapshot: () => locale.getSnapshot().revision }
  ctx.effect(() => locale.register(NS, { zh, en }), 'xiaomi-mimo-tts: dictionaries')

  const scope = ctx.configForms.get<TtsSettings>(TTS_SETTINGS_NAMESPACE)
  const focusOwner = new TabAudioFocus()
  const changes = ctx.pluginChanges.bundle('dsh-xiaomi-tts')
  ctx.effect(() => {
    const off = bindApiKeyStatus(scope, changes)
    window.addEventListener('online', apiKeyStatusStore.invalidate)
    return () => { window.removeEventListener('online', apiKeyStatusStore.invalidate); off() }
  }, 'xiaomi-mimo-tts: API key status')
  const voiceInput = new VoiceInputActivity(document)
  const tabAudioFocus = new PluginAudioFocus(focusOwner, changes)
  const audioFocus = new PluginAudioFocus(tabAudioFocus, voiceInput)
  const soundEffects = createSoundEffectsController(audioFocus.canPlay, tabAudioFocus.canPlay)
  const selectSoundSettings = (snapshot: ReturnType<typeof scope.getSnapshot>) => {
    const resolved = resolvedSettingsSnapshot(snapshot)
    return {
      enabled: resolved.soundEnabled,
      volume: resolved.soundVolume,
      pack: resolved.soundPack,
      taskSounds: resolved.taskSounds,
      clickSounds: resolved.clickSounds,
    }
  }
  const getSoundSettings = () => selectSoundSettings(scope.getSnapshot())
  ctx.effect(() => {
    const offClick = installClickSounds(ctx, soundEffects, getSoundSettings)
    const offTask = installTaskSoundWatcher(ctx, soundEffects, getSoundSettings)
    const offSettings = observeSettingsSlice(scope, selectSoundSettings, soundEffects.update)
    const offTabAudio = tabAudioFocus.subscribe(() => { if (!tabAudioFocus.canPlay()) void soundEffects.dispose() })
    return () => { offClick(); offTask(); offSettings(); offTabAudio(); void soundEffects.dispose() }
  }, 'xiaomi-mimo-tts: sound effects')
  const history = new AudioHistory()
  ctx.effect(() => () => history.dispose(), 'xiaomi-mimo-tts: audio history')
  const captions = new ReadingCaptions()
  const playback = new PlaybackController(history, captions)
  const live = new LiveSpeechController(history, captions)
  const local = new LocalSpeechController(captions)
  const speechActivity = new SpeechActivity()
  speechActivity.register(() => isSpeechBusy(playback.getSnapshot().status), () => { playback.resetAutomaticPlayback(); playback.interrupt() })
  speechActivity.register(live.isBusy, () => live.interrupt())
  speechActivity.register(local.isBusy, () => local.interrupt())
  let questionPlayback: QuestionTitlePlayback | undefined
  const pcmService = new XiaomiMimoTtsPcmService(ctx, scope, () => {
    questionPlayback?.stop()
    live.interrupt()
    local.interrupt()
    playback.interrupt()
  }, history, audioFocus.canPlay)
  const automaticAudioFocus = new PluginAudioFocus(audioFocus, pcmService.priorityActivity)
  questionPlayback = new QuestionTitlePlayback(speechActivity, () => resolveTtsSettings(scope.getSnapshot().value), pcmService.isBusy)
  const automaticReading = new AutomaticReading()
  ctx.effect(() => pcmService.priorityActivity.subscribe(() => {
    playback.resetAutomaticPlayback()
    if (pcmService.priorityActivity.getSnapshot()) automaticReading.interruptAutomatic()
  }), 'xiaomi-mimo-tts: important announcement focus')
  const hostChatSettings = ctx.configForms.get<{ foldedReplies?: 'all' | 'final' }>('ui-chat')
  const updateAutomaticReading = () => automaticReading.update(hostChatSettings.getSnapshot().value?.foldedReplies, () => {
    live.interrupt(); local.interrupt(); playback.interrupt()
  }, () => playback.resetAutomaticPlayback())
  updateAutomaticReading()
  ctx.effect(() => hostChatSettings.subscribe(updateAutomaticReading), 'xiaomi-mimo-tts: host reading preference')
  const questions = new QuestionTitleCollector()
  const announcements = new AnnouncementPlayback(pcmService, speechActivity, questionPlayback,
    () => resolveTtsSettings(scope.getSnapshot().value).importantAnnouncementsFirst)
  const collectors = new AnnouncementManager([
    new DshPetCollector(), questions,
    hostCollector(ctx, 'approvals', 'uiSession', (child, options) => observeApprovals(
      (child as unknown as { sessions: ISessions }).sessions, child.uiSession, t, options)),
    hostCollector(ctx, 'job-results', 'jobs', (child, options) => observeJobs((child as unknown as { sessions: ISessions }).sessions,
      (child as unknown as { jobs: AnnouncementJobs }).jobs, t, options)),
    hostCollector(ctx, 'subagent-results', 'sessions', (child, options) => observeSubagents(
      (child as unknown as { sessions: ISessions }).sessions, t, options)),
  ], announcements.play, announcements.stop)
  ctx.effect(() => {
    const select = (snapshot: ReturnType<typeof scope.getSnapshot>) => {
      const { announcementSources, autoPlay, enabled } = resolvedSettingsSnapshot(snapshot)
      return { enabled: snapshot.status === 'ready' && enabled, sources: autoPlay ? announcementSources : announcementSources.filter(source => source !== 'question-titles') }
    }
    const update = ({ enabled, sources }: ReturnType<typeof select>) => {
      collectors.update(sources, enabled && audioFocus.canPlay())
      if (!enabled) pcmService.stop()
    }
    const offSettings = observeSettingsSlice(scope, select, update)
    const offFocus = audioFocus.subscribe(() => update(select(scope.getSnapshot())))
    return () => { offSettings(); offFocus(); collectors.dispose() }
  }, 'xiaomi-mimo-tts: announcement collectors')
  ctx.effect(() => {
    const off = audioFocus.subscribe(() => {
      playback.resetAutomaticPlayback()
      if (audioFocus.canPlay()) return
      live.interrupt()
      local.interrupt()
      playback.interrupt()
      pcmService.stop()
      questionPlayback?.stop()
      history.stopReplay()
      void soundEffects.dispose()
    })
    const deactivate = focusOwner.activate()
    return () => { deactivate(); off() }
  }, 'xiaomi-mimo-tts: tab audio focus')
  ctx.effect(() => {
    voiceInput.start(soundEffects.playMicrophoneCue)
    return () => voiceInput.dispose()
  }, 'xiaomi-mimo-tts: voice input activity')
  let providerSelectionKey: string | null = null
  ctx.effect(() => observeSettingsSlice(scope, snapshot => {
    const settings = resolvedSettingsSnapshot(snapshot)
    const { requestTimeoutMs, maxPausedPcmBytes, maxTextLength } = settings
    return { key: ttsSelectionKey(settings), requestTimeoutMs, maxPausedPcmBytes, maxTextLength }
  }, ({ key }) => {
    if (providerSelectionKey !== null && providerSelectionKey !== key) {
      live.interrupt(); playback.interrupt(); local.interrupt(); pcmService.stop()
      questionPlayback?.stop()
    }
    providerSelectionKey = key
    const settings = resolvedSettingsSnapshot(scope.getSnapshot())
    live.configure(settings)
    playback.configure(settings)
  }), 'xiaomi-mimo-tts: provider selection')
  const stopOptionalPcm = () => { pcmService.stop(); questionPlayback?.stop(); history.stopReplay() }
  live.setBeforePlayback(stopOptionalPcm)
  local.setBeforePlayback(stopOptionalPcm)
  playback.setBeforePlayback(stopOptionalPcm)
  live.setStateChangeListener((sessionId, messageId, status, error) => playback.updateLivePlayback(sessionId, messageId, status, 'live', error))
  local.setStateChangeListener((sessionId, messageId, status, error) => playback.updateLivePlayback(sessionId, messageId, status, 'system', error))
  const stopAllPlayback = () => {
    playback.resetAutomaticPlayback()
    live.interrupt(); local.interrupt(); playback.interrupt()
    pcmService.stop(); questionPlayback?.stop(); history.stopReplay()
  }
  ctx.effect(() => {
    const off = engineStateStore.subscribe(stopAllPlayback)
    const stop = engineStateStore.start(apiKeyStatusStore.acceptHostStatuses)
    return () => { off(); stop() }
  }, 'xiaomi-mimo-tts: speech engine state')
  ctx.effect(() => observePluginActivity(changes, stopAllPlayback), 'xiaomi-mimo-tts: plugin changes')
  ctx.effect(() => observeSettingsSlice(scope, snapshot => resolvedSettingsSnapshot(snapshot).voiceVolume, volume => {
    live.setVolume(volume); local.setVolume(volume); playback.setVolume(volume); pcmService.setVolume(volume); questionPlayback?.setVolume(volume)
  }), 'xiaomi-mimo-tts: voice volume')

  ctx.effect(() => observeSettingsSlice(scope, snapshot => resolvedSettingsSnapshot(snapshot).voiceRate, rate => {
    live.setVoiceRate(rate); local.setVoiceRate(rate); playback.setVoiceRate(rate)
  }), 'xiaomi-mimo-tts: voice rate')

  ctx.effect(() => observeSettingsSlice(scope, snapshot => {
    const { localVoiceURI, localVoiceEngine, mossBaseURL, mossVoice, requestTimeoutMs } = resolvedSettingsSnapshot(snapshot)
    return { localVoiceURI, localVoiceEngine, mossBaseURL, mossVoice, requestTimeoutMs }
  }, ({ localVoiceURI, localVoiceEngine, mossBaseURL, mossVoice, requestTimeoutMs }) => {
    local.setVoiceURI(localVoiceURI)
    local.setMossVoice(localVoiceEngine, mossBaseURL, mossVoice)
    local.setTimeoutMs(requestTimeoutMs)
  }), 'xiaomi-mimo-tts: local speech settings')

  ctx.effect(() => async () => {
    live.setBeforePlayback(null)
    local.setBeforePlayback(null)
    playback.setBeforePlayback(null)
    await pcmService.dispose()
    await questionPlayback?.dispose()
  }, 'xiaomi-mimo-tts: optional PCM service')
  ctx.effect(() => () => playback.dispose(), 'xiaomi-mimo-tts: playback')
  ctx.effect(() => () => live.dispose(), 'xiaomi-mimo-tts: live playback')
  ctx.effect(() => () => local.dispose(), 'xiaomi-mimo-tts: local playback')

  ctx.effect(() => {
    const offCore = ensureClientStyle('core', CORE_CLIENT_STYLES)
    return () => {
      offCore()
      disposePersistentClientStyles()
    }
  }, 'xiaomi-mimo-tts: styles')

  // The settings shell owns the nav glyph per section id and only falls back to
  // its gear when no `settings.section.icon` entry matches the section.
  registerSlotContribution(ctx, 'settings.section.icon', () => observeHostSettingsEntry(scope, () => registerVoiceReadingNavIcon(ctx)))

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-session-playback-observer',
    order: 998,
    inject: (_sessionId: string) => ({ playback, live, local, settings: scope, audioFocus, automaticAudioFocus, questions, automaticReading }),
  }, SessionPlaybackObserver))

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-reading-captions',
    order: 997,
    locale: NS,
    inject: (_sessionId: string) => ({ captions, playback, settings: scope, t }),
  }, ReadingCaptionBar))

  registerSlotContribution(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: (_sessionId: string) => ({ playback, live, local, settings: scope, t, audioFocus, automaticAudioFocus, automaticReading }),
  }, ReadAloudAction))

  registerSlotContribution(ctx, 'plugins.detail.actions', () => ctx.slots.register({
    name: 'plugins.detail.actions',
    id: 'xiaomi-mimo-tts.manual',
    locale: NS,
    inject: () => ({ t, scope, onOpenWorkbench: () => ctx.layout.selectPanel(VOICE_SETTINGS_PANEL_ID as MainPanelId) }),
  }, PluginDetailActions))

  registerSlotContribution(ctx, 'plugins.detail.badge', () => ctx.slots.register({
    name: 'plugins.detail.badge',
    id: 'xiaomi-mimo-tts.key-status',
    locale: NS,
    inject: () => ({ t, scope, changes }),
  }, PluginDetailBadge))

  const settingsPageProps = { scope, t, localeRevision, controller: soundEffects, history, audioFocus, speechActivity, changes, beforePreview: stopAllPlayback, beforeHistoryPlayback: stopAllPlayback,
    onOpenProviderSettings: (bundle: string) => ctx.pluginNavigation.openBundle(bundle),
  }
  registerSlotContribution(ctx, 'plugins.bundle.config', () => registerBundleSettings(ctx, {
    ...settingsPageProps, onSidebarChange: mounted => { if (mounted) ctx.layout.selectPanel(VOICE_SETTINGS_PANEL_ID as MainPanelId) },
  }))

  registerSlotContribution(ctx, 'plugins.row.config', () => [registerWhalePersonaSettings(ctx, t, changes), registerQqbotSpeechSettings(ctx, t, changes), registerPassportSettings(ctx, t, changes)])

  registerSlotContribution(ctx, 'plugins.bundle.activation', () => ctx.slots.register({
    name: 'plugins.bundle.activation',
    key: 'dsh-xiaomi-tts',
    locale: NS,
    inject: () => ({ t, scope, changes, onOpenWorkbench: () => openVoiceWorkbench(ctx, scope) }),
  }, ActivationGuide))

  registerSlotContribution(ctx, 'sidebar.panellist', () => registerVoiceSettingsSidebar(ctx, settingsPageProps))

  registerSlotContribution(ctx, 'settings.section', () => observeHostSettingsEntry(scope, () => ctx.slots.register({
    name: 'settings.section',
    id: 'voice-reading',
    order: 20,
    label: () => t('settings.voiceReadingNav'),
    inject: (): VoiceReadingSectionInjected => ({
      scope,
      t, localeRevision,
      changes,
      openPluginSettings: () => ctx.pluginNavigation.openBundle('dsh-xiaomi-tts'),
    }),
  }, VoiceReadingSection)))
}
