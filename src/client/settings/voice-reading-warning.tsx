import type { ReactElement } from 'react'
import { useState } from 'react'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResolvedTtsSettings } from '../../shared.js'
import { useApiKeyStatus } from '../conversation/api-key-status.js'
import type { Translate } from '../localization.js'
import { voiceReadingWarningKey } from './voice-reading-options.js'

interface VoiceReadingWarningProps {
  active?: boolean
  settings: ResolvedTtsSettings
  t: Translate
  openPluginSettings: () => void
}

export function VoiceReadingWarning({ settings, t, openPluginSettings, active: enabled = true }: VoiceReadingWarningProps): ReactElement | null {
  const { provider } = settings
  const status = useApiKeyStatus(enabled, provider)
  const warning = voiceReadingWarningKey(settings, status)
  return warning === null ? null : <WarningBar
    key={`${provider}:${warning}`}
    message={t(warning)}
    dismissLabel={t('settings.voiceReadingDismissWarning')}
    settingsLabel={t('settings.voiceReadingPluginSettings')}
    openPluginSettings={openPluginSettings}
  />
}

interface WarningBarProps {
  message: string
  dismissLabel: string
  settingsLabel: string
  openPluginSettings: () => void
}

function WarningBar({ message, dismissLabel, settingsLabel, openPluginSettings }: WarningBarProps): ReactElement | null {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  const [before, after] = message.split('{settings}')
  return <div className="xmimo-voice-reading-warning" role="status">
    <span className="xmimo-voice-reading-warning-message" title={message.replace('{settings}', settingsLabel)}>
      {before}
      {after === undefined ? null : <>
        <button type="button" className="xmimo-voice-reading-link" onClick={openPluginSettings}>
          <span className="xmimo-voice-reading-link-label">{settingsLabel}</span>
        </button>
        {after}
      </>}
    </span>
    <button type="button" className="xmimo-voice-reading-warning-close" aria-label={dismissLabel} title={dismissLabel} onClick={() => { setDismissed(true) }}>
      <IconCloseOutlineRegular aria-hidden="true" />
    </button>
  </div>
}
