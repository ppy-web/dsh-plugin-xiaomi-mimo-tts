import type { ReactElement } from 'react'
import { TTS_PREVIEW_WHALE_ASSET_ROUTE } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { PreviewStatus } from '../playback/preview-player.js'
import { hostRoute } from '../host-route.js'

export interface PreviewModuleProps {
  t: Translate
  enabled: boolean
  status: PreviewStatus
  text: string
  onToggle: () => void
  onTextChange: (value: string) => void
}

export function PreviewModule({ t, enabled, status, text, onToggle, onTextChange }: PreviewModuleProps): ReactElement {
  const busy = status === 'loading' || status === 'playing'
  const messageKey = status === 'error'
    ? 'settings.previewFailed'
    : status === 'loading'
      ? 'settings.previewLoading'
      : status === 'playing'
        ? 'settings.previewPlaying'
        : 'settings.previewHint'

  return <section className="xmimo-tts-settings-module xmimo-tts-preview xmimo-ui-module xmimo-ui-module-padded">
    <strong className="xmimo-tts-preview-title xmimo-ui-module-heading">{t('settings.previewTitle')}</strong>
    <div className="xmimo-tts-preview-input">
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
  </section>
}
