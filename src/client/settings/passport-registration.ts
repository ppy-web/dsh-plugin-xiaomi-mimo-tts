import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PassportSettings } from '../../types/passport.js'
import { NS } from '../localization.js'
import type { Translate } from '../localization.js'
import type { SnapshotSource } from '../plugin-activity.js'
import { PassportSettingsPage } from './passport-settings.js'

export function registerPassportSettings(ctx: Context, t: Translate, changes: SnapshotSource<boolean>): () => void {
  return ctx.slots.register({
    name: 'plugins.row.config', key: 'dsh-xiaomi-tts#speech-delivery-passport', locale: NS,
    inject: () => ({ scope: ctx.configForms.get<PassportSettings>('speech-delivery-passport'), t, changes }),
  }, PassportSettingsPage)
}
