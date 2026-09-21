import type { ReactElement } from 'react'
import { TTS_PREVIEW_WHALE_ASSET_ROUTE } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { PreviewError, PreviewSource, PreviewStatus } from '../playback/preview-player.js'
import { hostRoute } from '../host-route.js'
import { ModuleShell } from './module-shell.js'

export interface PreviewModuleProps {
  t: Translate
  enabled: boolean
  status: PreviewStatus
  source: PreviewSource
  error: PreviewError | null
  text: string
  onToggle: () => void
  onTextChange: (value: string) => void
}

export function PreviewModule({ t, enabled, status, source, error, text, onToggle, onTextChange }: PreviewModuleProps): ReactElement {
  const busy = status === 'loading' || status === 'playing'
  const errorKey = error === 'api-key-not-configured'
    ? 'settings.previewErrorApiKeyMissing'
    : error === 'api-key-rejected'
      ? 'settings.previewErrorApiKeyRejected'
      : error === 'rate-limited'
        ? 'settings.previewErrorRateLimited'
        : error === 'timeout'
          ? 'settings.previewErrorTimeout'
          : error === 'local-voice-unavailable'
            ? 'settings.previewErrorLocalUnavailable'
            : error === 'autoplay-blocked'
              ? 'settings.previewErrorAutoplay'
              : 'settings.previewFailed'
  const messageKey = status === 'error'
    ? errorKey
    : status === 'loading'
      ? source === 'local' ? 'settings.previewLoadingLocal' : 'settings.previewLoadingMimo'
      : status === 'playing'
        ? source === 'local' ? 'settings.previewPlayingLocal' : 'settings.previewPlayingMimo'
        : source === 'local'
          ? 'settings.previewCompletedLocal'
          : source === 'mimo'
            ? 'settings.previewCompletedMimo'
            : 'settings.previewHint'

  return <ModuleShell className="xmimo-tts-settings-module xmimo-tts-preview xmimo-ui-module-padded" title={t('settings.previewTitle')} headingClassName="xmimo-tts-preview-title">
    <div className="xmimo-tts-preview-input xmimo-ui-module-content">
      <span className={status === 'error' ? 'xmimo-tts-character-bubble xmimo-tts-preview-status xmimo-tts-failed' : 'xmimo-tts-character-bubble xmimo-tts-preview-status'} aria-live="polite">{t(messageKey)}</span>
      <button
        type="button"
        className={busy ? 'xmimo-tts-preview-whale-button xmimo-tts-preview-whale-button-active' : 'xmimo-tts-preview-whale-button'}
        style={{ backgroundImage: `url(${hostRoute(TTS_PREVIEW_WHALE_ASSET_ROUTE)})` }}
        disabled={!enabled || text.trim().length === 0}
        aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
        onClick={onToggle}
      />
      <textarea
        value={text}
        rows={1}
        maxLength={100}
        aria-label={t('settings.previewText')}
        placeholder={t('settings.previewPlaceholder')}
        onChange={(event) => { onTextChange(event.target.value) }}
      />
    </div>
  </ModuleShell>
}
