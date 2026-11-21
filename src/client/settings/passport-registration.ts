import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createElement, Fragment } from 'react'
import type { ReactElement } from 'react'
import type { PassportSettings } from '../../types/passport.js'
import { TTS_SETTINGS_NAMESPACE, type TtsSettings } from '../shared.js'
import { NS } from '../localization.js'
import type { Translate } from '../localization.js'
import type { SnapshotSource } from '../plugin-activity.js'
import { lazyPanel } from '../lazy-panel.js'
import type { PassportSettingsProps } from './passport-settings.js'

const PassportSettingsPage = lazyPanel(() => import('./passport-settings.js').then(module => module.PassportSettingsPage))

function PassportSettings(props: PassportSettingsProps): ReactElement {
  if (props.view === 'summary') return createElement(Fragment, null, props.t('passport.description'))
  return createElement(PassportSettingsPage, props)
}

export function registerPassportSettings(ctx: Context, t: Translate, changes: SnapshotSource<boolean>): () => void {
  return ctx.slots.register({
    name: 'plugins.row.config', key: 'dsh-xiaomi-tts#speech-delivery-passport', locale: NS,
    inject: () => ({ scope: ctx.configForms.get<PassportSettings>('speech-delivery-passport'),
      ttsScope: ctx.configForms.get<TtsSettings>(TTS_SETTINGS_NAMESPACE), t, changes,
      openTtsSettings: () => ctx.pluginNavigation.openBundle('dsh-xiaomi-tts') }),
  }, PassportSettings)
}
