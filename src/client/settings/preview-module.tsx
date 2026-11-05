import { useEffect, useRef, useState, type ReactElement } from 'react'
import { RiDownloadLine, RiRadio2Line } from 'react-icons/ri'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PreviewError, PreviewRecording, PreviewSource, PreviewStatus } from '../playback/preview-player.js'
import { CollapsibleModule } from './collapsible-module.js'
import { AnnouncementSettings, ANNOUNCEMENT_SOURCE_OPTIONS } from './announcement-settings.js'
import type { AnnouncementSettingsProps } from './announcement-settings.js'
import { PlaybackIcon } from '../playback/playback-icon.js'
import { AudioTagPicker } from './controls/audio-tag-picker.js'
import { SidebarSettings } from './sidebar-settings.js'
import { ProviderSettings } from './provider-settings.js'
import type { ProviderSettingsProps } from './provider-settings.js'
import { PREVIEW_PRESETS } from './preview-presets.js'
import { HistoryDownloads } from '../history/history-list.js'

export interface PreviewModuleProps extends AnnouncementSettingsProps, Omit<ProviderSettingsProps, 't' | 'writable'> {
  showInSidebar: boolean
  sidebarOverridden: boolean
  onShowInSidebarChange: (value: boolean) => void
  onResetSidebar: () => void
  enabled: boolean
  status: PreviewStatus
  source: PreviewSource
  error: PreviewError | null
  text: string
  recording: PreviewRecording | null
  onToggle: () => void
  onTextChange: (value: string) => void
  open: boolean
  onToggleOpen: () => void
  audioTagProvider?: 'xiaomi' | 'breeze' | undefined
}

export function PreviewModule({ t, enabled, status, source, error, text, recording, onToggle, onTextChange, open, onToggleOpen, audioTagProvider, doubaoEnabled, breezeEnabled, mossEnabled, onMossEnabledChange, onProviderEnabledChange, showInSidebar, sidebarOverridden, onShowInSidebarChange, onResetSidebar, ...settings }: PreviewModuleProps): ReactElement {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [downloads] = useState(() => new HistoryDownloads())
  const [downloadFailed, setDownloadFailed] = useState(false)
  useEffect(() => () => downloads.dispose(), [downloads])
  const changeText = (next: string): void => { setDownloadFailed(false); onTextChange(next) }
  const download = (): void => {
    if (recording === null) return
    setDownloadFailed(false)
    try { downloads.downloadBlob(recording.blob, `tts-preview-${Date.now()}.${recording.format}`) }
    catch { setDownloadFailed(true) }
  }
  const insertTag = (tag: string, placement?: 'start'): void => {
    const textarea = textRef.current
    if (textarea === null) return
    const start = placement === 'start' ? 0 : textarea.selectionStart ?? text.length
    const end = placement === 'start' ? 0 : textarea.selectionEnd ?? start
    const spacer = start > 0 && !/\s$/u.test(text.slice(0, start)) ? ' ' : ''
    const next = `${text.slice(0, start)}${spacer}${tag}${text.slice(end)}`
    changeText(next)
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
        <div className="xmimo-tts-preview-input">
          <textarea
            ref={textRef}
            value={text}
            rows={5}
            maxLength={100}
            aria-label={t('settings.previewText')}
            placeholder={t('settings.previewPlaceholder')}
            onChange={(event) => { changeText(event.target.value) }}
          />
          <div className="xmimo-tts-preview-tools">
            <div className="xmimo-tts-preview-presets" role="group" aria-label={t('settings.previewPresets')}>
              {PREVIEW_PRESETS.map(preset => <button key={preset.text} type="button" className="xmimo-tts-preview-preset"
                aria-pressed={text === t(preset.text)} title={t(preset.text)}
                onClick={() => changeText(t(preset.text))}>{t(preset.label)}</button>)}
            </div>
            <div className="xmimo-tts-preview-actions">
              {audioTagProvider ? <AudioTagPicker key={audioTagProvider} provider={audioTagProvider} disabled={!enabled} onInsert={insertTag} t={t} /> : null}
              <div className="xmimo-tts-preview-playback-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="xmimo-tts-preview-toggle"
                  title={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
                  aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
                  disabled={!enabled || (!busy && text.trim().length === 0)}
                  onClick={() => { setDownloadFailed(false); onToggle() }}
                ><PlaybackIcon state={busy ? 'stop' : 'play'} /><span>{t(busy ? 'settings.previewStopShort' : 'settings.previewListen')}</span></Button>
                <Button type="button" variant="ghost" size="sm" className="xmimo-tts-preview-download"
                  aria-label={t('settings.previewDownload')}
                  title={t(recording !== null ? 'settings.previewDownload' : source === 'local' ? 'settings.previewDownloadLocal' : 'settings.previewDownloadUnavailable')}
                  disabled={recording === null} onClick={download}><RiDownloadLine size={16} aria-hidden="true" /><span>{t('history.download')}</span></Button>
              </div>
            </div>
          </div>
        </div>
        <small className={status === 'error' ? 'xmimo-tts-failed' : 'xmimo-tts-preview-status'} aria-live="polite">{t(messageKey)}</small>
        {downloadFailed ? <small className="xmimo-tts-failed" role="alert">{t('settings.previewDownloadFailed')}</small> : null}
      </div>
      <ProviderSettings t={t} writable={settings.writable} doubaoEnabled={doubaoEnabled} breezeEnabled={breezeEnabled} mossEnabled={mossEnabled} onMossEnabledChange={onMossEnabledChange} onProviderEnabledChange={onProviderEnabledChange} />
      <AnnouncementSettings t={t} {...settings} parentOpen={open}>
        <SidebarSettings t={t} value={showInSidebar} writable={settings.writable} overridden={sidebarOverridden} onChange={onShowInSidebarChange} onReset={onResetSidebar} />
      </AnnouncementSettings>
    </div>
  </CollapsibleModule>
}
