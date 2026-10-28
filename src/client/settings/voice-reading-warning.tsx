import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_API_KEY_STATUS_ROUTE } from '../../shared.js'
import type { ResolvedTtsSettings } from '../../shared.js'
import { onTtsCredentialsSaved } from '../conversation/api-key-status.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'
import type { ApiKeyStatus } from './api-key-state.js'
import { voiceReadingWarningKey } from './voice-reading-options.js'

interface VoiceReadingWarningProps {
  active?: boolean
  settings: ResolvedTtsSettings
  revision: unknown
  t: Translate
  openPluginSettings: () => void
}

export function VoiceReadingWarning({ settings, revision, t, openPluginSettings, active: enabled = true }: VoiceReadingWarningProps): ReactElement | null {
  const { provider } = settings
  const [result, setResult] = useState<{ provider: typeof provider; status: ApiKeyStatus } | null>(null)
  const [generation, setGeneration] = useState(0)
  useEffect(() => onTtsCredentialsSaved(() => { setGeneration(value => value + 1) }), [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    setResult(null)
    const controller = new AbortController()
    void fetch(`${hostRoute(TTS_API_KEY_STATUS_ROUTE)}?provider=${provider}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('api-key-status-failed')
      const status = await response.json() as { configured?: unknown; supported?: unknown }
      if (active) setResult({ provider, status: status.configured !== true ? 'missing' : status.supported === true ? 'recognized' : 'unrecognized' })
    }).catch(() => {
      if (active) setResult({ provider, status: 'unavailable' })
    })
    return () => { active = false; controller.abort() }
  }, [provider, revision, generation, enabled])

  const status = enabled && result?.provider === provider ? result.status : 'loading'
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
