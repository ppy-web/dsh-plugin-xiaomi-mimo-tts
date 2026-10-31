import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../../types/settings.js'
import { QqbotSpeechSettings } from './qqbot-settings.js'
import type { WhaleSettings } from '../../types/whale.js'
import { NS, type Translate } from '../localization.js'
import type { SnapshotSource } from '../plugin-activity.js'
import { WhalePersonaSettings } from './whale-settings.js'

/** Each component edits only the settings it owns. */
export function registerWhalePersonaSettings(ctx: Context, t: Translate, changes: SnapshotSource<boolean>): () => void {
  return ctx.slots.register({
    name: 'plugins.row.config', key: 'dsh-xiaomi-tts#preset-whale-girl', locale: NS,
    inject: () => ({ scope: ctx.configForms.get<WhaleSettings>('preset-whale-girl'), t, changes }),
  }, WhalePersonaSettings)
}

export function registerQqbotSpeechSettings(ctx: Context, t: Translate, changes: SnapshotSource<boolean>): () => void {
  return ctx.slots.register({
    name: 'plugins.row.config', key: 'dsh-xiaomi-tts#speech-delivery-qqbot', locale: NS,
    inject: () => ({ scope: ctx.configForms.get<TtsSettings>('xiaomi-mimo-tts'), t, changes }),
  }, QqbotSpeechSettings)
}
