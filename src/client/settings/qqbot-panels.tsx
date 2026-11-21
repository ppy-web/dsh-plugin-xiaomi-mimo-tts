import type { ReactElement } from 'react'
import type { QqbotSpeechSettingsProps } from './qqbot-settings.js'
import { QqbotSpeechSettings as BaseQqbotSpeechSettings } from './qqbot-settings.js'
import type { WhaleSettingsProps } from './whale-settings.js'
import { WhalePersonaSettings as BaseWhalePersonaSettings } from './whale-settings.js'
import { QQBOT_CLIENT_STYLES } from '../style/qqbot-styles.js'
import { useClientStyle } from '../style/inject.js'

export function WhalePersonaSettings(props: WhaleSettingsProps): ReactElement {
  useClientStyle('qqbot', QQBOT_CLIENT_STYLES)
  return <BaseWhalePersonaSettings {...props} />
}

export function QqbotSpeechSettings(props: QqbotSpeechSettingsProps): ReactElement {
  useClientStyle('qqbot', QQBOT_CLIENT_STYLES)
  return <BaseQqbotSpeechSettings {...props} />
}
