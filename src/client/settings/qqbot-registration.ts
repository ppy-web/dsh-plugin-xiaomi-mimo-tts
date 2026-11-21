import { createElement, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../../types/settings.js'
import { TTS_SETTINGS_NAMESPACE } from '../../constants.js'
import type { QqbotSpeechSettingsProps } from './qqbot-settings.js'
import type { WhaleSettings } from '../../types/whale.js'
import { NS, type Translate } from '../localization.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { WhaleSettingsProps } from './whale-settings.js'
import { lazyPanel } from '../lazy-panel.js'

const LazyWhalePersonaPage = lazyPanel<WhaleSettingsProps>(() => import('./qqbot-panels.js').then(module => module.WhalePersonaSettings))
const LazyQqbotSpeechPage = lazyPanel<QqbotSpeechSettingsProps>(() => import('./qqbot-panels.js').then(module => module.QqbotSpeechSettings))

function WhalePersonaSettings(props: WhaleSettingsProps): ReactElement {
  if (props.view === 'summary') return createElement(FragmentWrapper, null, props.t('whale.description'))
  return createElement(LazyWhalePersonaPage, props)
}

function QqbotSpeechSettings(props: QqbotSpeechSettingsProps): ReactElement {
  if (props.view === 'summary') return createElement(FragmentWrapper, null, props.t('qq.description'))
  return createElement(LazyQqbotSpeechPage, props)
}

function FragmentWrapper({ children }: { children?: string }): ReactElement {
  return children as unknown as ReactElement
}

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
    inject: () => ({ scope: ctx.configForms.get<TtsSettings>(TTS_SETTINGS_NAMESPACE), personaScope: ctx.configForms.get<WhaleSettings>('speech-delivery-qqbot'), t, changes }),
  }, QqbotSpeechSettings)
}
