import { useRef, type ReactElement } from 'react'
import { RiRadio2Line } from 'react-icons/ri'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PreviewError, PreviewSource, PreviewStatus } from '../playback/preview-player.js'
import { CollapsibleModule } from './collapsible-module.js'
import { AnnouncementSettings, ANNOUNCEMENT_SOURCE_OPTIONS } from './announcement-settings.js'
import type { AnnouncementSettingsProps } from './announcement-settings.js'
import { PlaybackIcon } from '../playback/playback-icon.js'
import { BreezeAudioTagPicker } from './controls/breeze-audio-tag-picker.js'
import { ProviderSettings } from './provider-settings.js'
import type { ProviderSettingsProps } from './provider-settings.js'

export interface PreviewModuleProps extends AnnouncementSettingsProps, Omit<ProviderSettingsProps, 't' | 'writable'> {
  enabled: boolean
  status: PreviewStatus
  source: PreviewSource
  error: PreviewError | null
  text: string
  onToggle: () => void
  onTextChange: (value: string) => void
  open: boolean
  onToggleOpen: () => void
  breezeAudioTags?: boolean
}

export function PreviewModule({ t, enabled, status, source, error, text, onToggle, onTextChange, open, onToggleOpen, breezeAudioTags = false, doubaoEnabled, breezeEnabled, onProviderEnabledChange, ...settings }: PreviewModuleProps): ReactElement {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const insertTag = (tag: string): void => {
    const textarea = textRef.current
    if (textarea === null) return
    const start = textarea.selectionStart ?? text.length
    const end = textarea.selectionEnd ?? start
    const spacer = start > 0 && !/\s$/u.test(text.slice(0, start)) ? ' ' : ''
    const next = `${text.slice(0, start)}${spacer}${tag}${text.slice(end)}`
    onTextChange(next)
    requestAnimationFrame(() => { textarea.focus(); const position = start + spacer.length + tag.length; textarea.setSelectionRange(position, position) })
  }
  const busy = status === 'loading' || status === 'playing'
  const errorKey = error === 'save-key-first' ? 'settings.previewSaveKeyFirst'
    : error === 'voice-required' ? 'settings.doubaoVoiceRequired'
    : error === 'voice-unavailable' ? 'settings.previewErrorVoiceUnavailable'
    : error === 'resource-unavailable' ? 'settings.previewErrorResourceUnavailable'
    : error === 'stream-buffer-limit' ? 'settings.previewErrorBufferLimit'
    : error === 'api-key-not-configured'
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
      ? source === 'doubao' ? 'settings.previewLoadingDoubao' : source === 'breeze' ? 'settings.previewLoadingBreeze' : source === 'local' ? 'settings.previewLoadingLocal' : 'settings.previewLoadingMimo'
      : status === 'playing'
        ? source === 'doubao' ? 'settings.previewPlayingDoubao' : source === 'breeze' ? 'settings.previewPlayingBreeze' : source === 'local' ? 'settings.previewPlayingLocal' : 'settings.previewPlayingMimo'
        : source === 'doubao' ? 'settings.previewCompletedDoubao' : source === 'breeze' ? 'settings.previewCompletedBreeze' : source === 'local'
          ? 'settings.previewCompletedLocal'
          : source === 'mimo'
            ? 'settings.previewCompletedMimo'
            : 'settings.previewHint'

  return <CollapsibleModule className="xmimo-tts-settings-module xmimo-tts-broadcast"
    title={<span className="xmimo-ui-module-title"><RiRadio2Line size={14} aria-hidden="true" focusable="false" />{t('settings.previewTitle')}</span>}
    ariaLabel={t('settings.previewTitle')}
    open={open} onToggle={onToggleOpen} interactiveSummary
    summary={<><span className="xmimo-ui-summary">
      <button
        type="button"
        className="xmimo-tts-preview-tag"
        title={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
        aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
        aria-pressed={busy}
        disabled={!enabled || (!busy && text.trim().length === 0)}
        onClick={onToggle}
      >
        <PlaybackIcon state={busy ? 'stop' : 'play'} />
        <span>{t(busy ? 'settings.previewStopShort' : 'settings.previewListen')}</span>
      </button>
      {ANNOUNCEMENT_SOURCE_OPTIONS.filter(option => settings.sources.includes(option.id)).map(option => <span key={option.id}>{t(option.label)}</span>)}
      {settings.qqbotEnabled ? <span>{t('settings.qqbotIntegration')}</span> : null}
      {settings.sources.length === 0 && !settings.qqbotEnabled ? <span>{t('settings.announcementsNone')}</span> : null}
    </span>
      {!open && status === 'error' ? <small className="xmimo-tts-preview-summary-status xmimo-tts-failed" role="status">{t(messageKey)}</small> : null}
    </>}>
    <div className="xmimo-tts-broadcast-body">
      <div className="xmimo-tts-format">
        {breezeAudioTags ? <BreezeAudioTagPicker disabled={!enabled} onInsert={insertTag} t={t} /> : null}
        <div className="xmimo-tts-preview-input">
          <textarea
            ref={textRef}
            value={text}
            rows={2}
            maxLength={100}
            aria-label={t('settings.previewText')}
            placeholder={t('settings.previewPlaceholder')}
            onChange={(event) => { onTextChange(event.target.value) }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="xmimo-tts-preview-toggle"
            title={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
            aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
            disabled={!enabled || text.trim().length === 0}
            onClick={onToggle}
          ><PlaybackIcon state={busy ? 'stop' : 'play'} /></Button>
        </div>
        <small className={status === 'error' ? 'xmimo-tts-failed' : 'xmimo-tts-preview-status'} aria-live="polite">{t(messageKey)}</small>
      </div>
      <ProviderSettings t={t} writable={settings.writable} doubaoEnabled={doubaoEnabled} breezeEnabled={breezeEnabled} onProviderEnabledChange={onProviderEnabledChange} />
      <AnnouncementSettings t={t} sources={settings.sources} writable={settings.writable} overridden={settings.overridden}
        qqbotEnabled={settings.qqbotEnabled} onQqbotChange={settings.onQqbotChange}
        onChange={settings.onChange} onReset={settings.onReset} />
    </div>
  </CollapsibleModule>
}
