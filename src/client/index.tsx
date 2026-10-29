import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TTS_SETTINGS_NAMESPACE, resolveTtsSettings, ttsSelection } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import { AutomaticReading } from './conversation/automatic-reading.js'
import { ReadAloudAction } from './conversation/read-aloud.js'
import { SessionPlaybackObserver } from './conversation/session-playback-observer.js'
import { NS, en, zh, ja, fr } from './localization.js'
import type { Translate } from './localization.js'
import { LiveSpeechController, LocalSpeechController, PlaybackController } from './playback/index.js'
import { XiaomiMimoTtsPcmService } from './playback/pcm-play-service.js'
import { onTtsCredentialsSaved } from './conversation/api-key-status.js'
import { SettingsCard } from './settings/card.js'
import { apiKeyStatusStore, bindApiKeyStatus } from './settings/api-key-status-store.js'
import { PluginDetailActions, PluginDetailBadge } from './settings/plugin-detail.js'
import { ActivationGuide } from './settings/activation-guide.js'
import { AudioHistoryTab } from './history/audio-history-tab.js'
import { PluginAudioFocus, observePluginActivity } from './plugin-activity.js'
import { installVoiceReadingNavIcon } from './settings/nav-icon.js'
import { VoiceReadingSection } from './settings/voice-reading-section.js'
import type { VoiceReadingSectionInjected } from './settings/voice-reading-section.js'
import { createSoundEffectsController, installClickSounds } from './sound-effects/index.js'
import { installTaskSoundWatcher } from './sound-effects/task-watcher.js'
import { CLIENT_STYLES } from './style/index.js'
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

/** Client services required by this plugin. */
export const inject = [
  'slots',
  'locale',
  'remote',
  'configForms',
  'pluginNavigation',
  'pluginChanges',
  'sessions',
]

function formatStartupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerSlotContribution(
  ctx: Context,
  name: 'conversation.input.dock' | 'conversation.chat.assistant-actions' | 'plugins.bundle.config' | 'settings.section' | 'plugins.bundle.activation' | 'plugins.tab' | 'plugins.detail.actions' | 'plugins.detail.badge',
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
  const locale = ctx.locale as unknown as {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: Record<string, typeof en>): () => void
  }
  const t = locale.bind(NS)
  ctx.effect(() => locale.register(NS, { zh, en, ja, fr }), 'xiaomi-mimo-tts: dictionaries')

  const scope = ctx.configForms.get<TtsSettings>(TTS_SETTINGS_NAMESPACE)
  const focusOwner = new TabAudioFocus()
  const changes = ctx.pluginChanges.bundle('dsh-xiaomi-tts')
  ctx.effect(() => {
    const off = bindApiKeyStatus(scope, changes)
    window.addEventListener('online', apiKeyStatusStore.invalidate)
    return () => { window.removeEventListener('online', apiKeyStatusStore.invalidate); off() }
  }, 'xiaomi-mimo-tts: API key status')
  const audioFocus = new PluginAudioFocus(focusOwner, changes)
  const soundEffects = createSoundEffectsController(audioFocus.canPlay)
  const getSoundSettings = () => {
    const resolved = resolveTtsSettings(scope.getSnapshot().value)
    return {
      enabled: resolved.soundEnabled,
      volume: resolved.soundVolume,
      pack: resolved.soundPack,
      taskSounds: resolved.taskSounds,
      clickSounds: resolved.clickSounds,
    }
  }
  soundEffects.update(getSoundSettings())
  ctx.effect(() => {
    const offClick = installClickSounds(ctx, soundEffects, getSoundSettings)
    const offTask = installTaskSoundWatcher(ctx, soundEffects, getSoundSettings)
    const offSettings = scope.subscribe(() => { soundEffects.update(getSoundSettings()) })
    return () => { offClick(); offTask(); offSettings(); void soundEffects.dispose() }
  }, 'xiaomi-mimo-tts: sound effects')
  const history = new AudioHistory()
  ctx.effect(() => () => history.dispose(), 'xiaomi-mimo-tts: audio history')
  const playback = new PlaybackController(history)
  const live = new LiveSpeechController(history)
  const local = new LocalSpeechController()
  const speechActivity = new SpeechActivity()
  speechActivity.register(() => isSpeechBusy(playback.getSnapshot().status))
  speechActivity.register(live.isBusy)
  speechActivity.register(local.isBusy)
  let questionPlayback: QuestionTitlePlayback | undefined
  const pcmService = new XiaomiMimoTtsPcmService(ctx, scope, () => {
    questionPlayback?.stop()
    live.interrupt()
    local.interrupt()
    playback.interrupt()
  }, history, audioFocus.canPlay)
  questionPlayback = new QuestionTitlePlayback(speechActivity, () => resolveTtsSettings(scope.getSnapshot().value), pcmService.isBusy)
  const automaticReading = new AutomaticReading()
  const hostChatSettings = ctx.configForms.get<{ foldedReplies?: 'all' | 'final' }>('ui-chat')
  const updateAutomaticReading = () => automaticReading.update(hostChatSettings.getSnapshot().value?.foldedReplies, () => {
    live.interrupt(); local.interrupt(); playback.interrupt()
  }, () => playback.resetAutomaticPlayback())
  updateAutomaticReading()
  ctx.effect(() => hostChatSettings.subscribe(updateAutomaticReading), 'xiaomi-mimo-tts: host reading preference')
  const questions = new QuestionTitleCollector()
  const announcements = new AnnouncementPlayback(pcmService, speechActivity, questionPlayback)
  const collectors = new AnnouncementManager([
    new DshPetCollector(), questions,
    hostCollector(ctx, 'approvals', 'uiSession', (child, options) => observeApprovals(
      (child as unknown as { sessions: ISessions }).sessions, child.uiSession, t, options)),
    hostCollector(ctx, 'job-results', 'jobs', (child, options) => observeJobs((child as unknown as { sessions: ISessions }).sessions,
      (child as unknown as { jobs: AnnouncementJobs }).jobs, t, options)),
  ], announcements.play, announcements.stop)
  ctx.effect(() => {
    const update = () => {
      const snapshot = scope.getSnapshot()
      const settings = resolveTtsSettings(snapshot.value)
      const sources = settings.announcementSources.filter(source => source !== 'question-titles' || settings.autoPlay)
      collectors.update(sources, snapshot.status === 'ready' && settings.enabled && audioFocus.canPlay())
      if (!settings.announcementSources.includes('dsh-whale-musume')) pcmService.stopExternal()
      if (snapshot.status !== 'ready' || !settings.enabled) pcmService.stop()
    }
    const offSettings = scope.subscribe(update)
    const offFocus = audioFocus.subscribe(update)
    update()
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
  let providerSelectionKey: string | null = null
  const updateProvider = () => {
    const settings = resolveTtsSettings(scope.getSnapshot().value)
    const key = JSON.stringify({ ...ttsSelection(settings), voiceRate: undefined })
    if (providerSelectionKey !== null && providerSelectionKey !== key) {
      live.interrupt(); playback.interrupt(); local.interrupt(); pcmService.stop()
      questionPlayback?.stop()
    }
    providerSelectionKey = key
    live.configure(settings)
    playback.configure(settings)
  }
  updateProvider()
  ctx.effect(() => scope.subscribe(updateProvider), 'xiaomi-mimo-tts: provider selection')
  ctx.effect(() => onTtsCredentialsSaved(() => { live.interrupt(); playback.interrupt(); local.interrupt(); pcmService.stop(); questionPlayback?.stop() }), 'xiaomi-mimo-tts: saved credentials')
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
  ctx.effect(() => observePluginActivity(changes, stopAllPlayback), 'xiaomi-mimo-tts: plugin changes')
  const updateVoiceVolume = () => { const volume = resolveTtsSettings(scope.getSnapshot().value).voiceVolume; live.setVolume(volume); local.setVolume(volume); playback.setVolume(volume); pcmService.setVolume(volume); questionPlayback?.setVolume(volume) }
  updateVoiceVolume()
  ctx.effect(() => scope.subscribe(updateVoiceVolume), 'xiaomi-mimo-tts: voice volume')

  const updateVoiceRate = () => { const rate = resolveTtsSettings(scope.getSnapshot().value).voiceRate; live.setVoiceRate(rate); local.setVoiceRate(rate); playback.setVoiceRate(rate) }
  updateVoiceRate()
  ctx.effect(() => scope.subscribe(updateVoiceRate), 'xiaomi-mimo-tts: voice rate')

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
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = CLIENT_STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'xiaomi-mimo-tts: styles')

  // The host shell hardcodes settings-nav glyphs by section id, so the plugin
  // marks its own nav cell for the stylesheet's speaker glyph.
  ctx.effect(() => installVoiceReadingNavIcon(), 'xiaomi-mimo-tts: settings nav icon')

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-session-playback-observer',
    order: 998,
    inject: (_sessionId: string) => ({ playback, live, local, settings: scope, audioFocus, questions, automaticReading }),
  }, SessionPlaybackObserver))

  registerSlotContribution(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: (_sessionId: string) => ({ playback, live, local, settings: scope, t, audioFocus, automaticReading }),
  }, ReadAloudAction))

  registerSlotContribution(ctx, 'plugins.detail.actions', () => ctx.slots.register({
    name: 'plugins.detail.actions',
    id: 'xiaomi-mimo-tts.manual',
    locale: NS,
    inject: () => ({ t }),
  }, PluginDetailActions))

  registerSlotContribution(ctx, 'plugins.detail.badge', () => ctx.slots.register({
    name: 'plugins.detail.badge',
    id: 'xiaomi-mimo-tts.key-status',
    locale: NS,
    inject: () => ({ t, scope, changes }),
  }, PluginDetailBadge))

  registerSlotContribution(ctx, 'plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-xiaomi-tts',
    locale: NS,
    inject: () => ({ scope, t, controller: soundEffects, history, audioFocus, speechActivity, changes, beforePreview: stopAllPlayback }),
  }, SettingsCard))

  registerSlotContribution(ctx, 'plugins.bundle.activation', () => ctx.slots.register({
    name: 'plugins.bundle.activation',
    key: 'dsh-xiaomi-tts',
    locale: NS,
    inject: () => ({ scope, t, audioFocus, changes, beforePreview: stopAllPlayback }),
  }, ActivationGuide))

  registerSlotContribution(ctx, 'plugins.tab', () => ctx.slots.register({
    name: 'plugins.tab',
    id: 'xiaomi-mimo-tts.audio-history',
    label: () => t('history.title'),
    order: 30,
    locale: NS,
    inject: () => ({ history, t, scope, changes, speechActivity, beforePlayback: () => {
      audioFocus.claim()
      if (!audioFocus.canPlay()) return false
      live.interrupt(); local.interrupt(); playback.interrupt()
      pcmService.stop(); questionPlayback?.stop()
      return true
    } }),
  }, AudioHistoryTab))

  registerSlotContribution(ctx, 'settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'voice-reading',
    order: 20,
    label: () => t('settings.voiceReadingNav'),
    inject: (): VoiceReadingSectionInjected => ({
      scope,
      t,
      changes,
      openPluginSettings: () => ctx.pluginNavigation.openBundle('dsh-xiaomi-tts'),
    }),
  }, VoiceReadingSection))
}
