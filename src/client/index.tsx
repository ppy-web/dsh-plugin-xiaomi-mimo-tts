import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TTS_SETTINGS_NAMESPACE } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import { ReadAloudAction, SessionPlaybackObserver } from './conversation.js'
import { NS, en, zh } from './localization.js'
import type { Translate } from './localization.js'
import { LiveSpeechController, PlaybackController } from './playback.js'
import { SettingsCard } from './settings-card.js'
import { decodeSettings } from './settings-scope.js'
import { CLIENT_STYLES } from './styles.js'

/** Client services required by this plugin. */
export const inject = [
  'slots',
  'locale',
  'connection',
  'remote',
  'settingsScope',
]

function formatStartupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerSlotContribution(
  ctx: ClientContext,
  name: 'conversation.input.dock' | 'conversation.chat.assistant-actions' | 'settings.plugin.item',
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

/** Register the Web action, settings card, locale dictionaries, and styles. */
export function apply(ctx: ClientContext): void {
  const locale = ctx.locale as unknown as {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void
  }
  const t = locale.bind(NS)
  ctx.effect(() => locale.register(NS, { zh, en }), 'xiaomi-mimo-tts: dictionaries')

  const scope = ctx.settingsScope.bind<TtsSettings>({
    namespace: TTS_SETTINGS_NAMESPACE,
    decode: decodeSettings,
  })
  const playback = new PlaybackController()
  const live = new LiveSpeechController()
  live.setStateChangeListener((sessionId, messageId, status) => playback.updateLivePlayback(sessionId, messageId, status))

  ctx.effect(() => () => playback.dispose(), 'xiaomi-mimo-tts: playback')
  ctx.effect(() => () => live.dispose(), 'xiaomi-mimo-tts: live playback')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = CLIENT_STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'xiaomi-mimo-tts: styles')

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-session-playback-observer',
    order: 998,
    inject: () => ({ playback, live, settings: scope }),
  }, SessionPlaybackObserver))

  registerSlotContribution(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: () => ({ playback, live, settings: scope, t }),
  }, ReadAloudAction))

  registerSlotContribution(ctx, 'settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TTS_SETTINGS_NAMESPACE,
    locale: NS,
    inject: () => ({ scope, t }),
  }, SettingsCard))
}
