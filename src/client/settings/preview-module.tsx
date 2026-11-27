import { useEffect, useRef, useState, type ReactElement } from 'react'
import { RiDownloadLine, RiRadio2Line } from 'react-icons/ri'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PreviewError, PreviewRecording, PreviewSource, PreviewStatus } from '../playback/preview-player.js'
import { CollapsibleModule } from './collapsible-module.js'
import { useSettingsSearch } from './settings-search-context.js'
import { AnnouncementSettings, ANNOUNCEMENT_SOURCE_OPTIONS, ANNOUNCEMENT_TOGGLE_FIELDS } from './announcement-settings.js'
import type { AnnouncementToggle, AnnouncementToggleField } from './announcement-settings.js'
import type { OpenApiSettingsProps } from './open-api-settings.js'
import { PlaybackIcon } from '../playback/playback-icon.js'
import { AudioTagPicker } from './controls/audio-tag-picker.js'
import { TactileButton } from './controls/tactile-button.js'
import { ProviderSettings } from './provider-settings.js'
import type { ExternalSpeechSelection } from '../../host-api.js'
import type { AnnouncementSourceId } from '../../types/settings.js'
import type { OptionalTtsProvider } from '../../types/providers.js'
import { PREVIEW_PRESETS } from './preview-presets.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { HistoryDownloads } from '../history/history-list.js'
import type { SettingsValues, SettingField } from './types.js'
import type { Translate } from '../localization.js'

export const BROADCAST_FIELDS = [
  'announcementSources', 'qqbotEnabled', 'doubaoEnabled', 'breezeEnabled', 'deepseekEnabled',
  'mossEnabled', 'acceptExternalProviders', ...ANNOUNCEMENT_TOGGLE_FIELDS,
] as const satisfies readonly SettingField[]

export interface PreviewModuleProps {
  t: Translate
  writable: boolean
  draft: Pick<SettingsValues, typeof BROADCAST_FIELDS[number]>
  overrides: readonly SettingField[]
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
  externalSelection?: ExternalSpeechSelection | undefined
  onSettingChange: (field: AnnouncementToggleField, value: boolean) => void
  resetField: (field: AnnouncementToggleField) => void
  onSourcesChange: (sources: AnnouncementSourceId[]) => void
  onSourcesReset: () => void
  onQqbotChange: (enabled: boolean) => void
  onAcceptExternalProvidersChange: (enabled: boolean) => void
  onMossEnabledChange: (enabled: boolean) => void
  onProviderEnabledChange: (provider: OptionalTtsProvider, enabled: boolean) => void
  openApi?: OpenApiSettingsProps | undefined
}

export function PreviewModule({
  t, writable, draft, overrides, enabled, status, source, error, text, recording, onToggle, onTextChange, open, onToggleOpen, audioTagProvider, externalSelection,
  onSettingChange, resetField, onSourcesChange, onSourcesReset, onQqbotChange,
  onAcceptExternalProvidersChange, onMossEnabledChange, onProviderEnabledChange, openApi,
}: PreviewModuleProps): ReactElement {
  const { result: search, hide } = useSettingsSearch()
  useEngineState()
  const external = externalEngine()
  const externalTags = external?.models?.find(model => model.id === (externalSelection?.model ?? external.selection?.model))?.audioTags
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
  const messageKey = external && source === null ? external.ready ? 'settings.externalManaged' : 'settings.externalNotReady' : source === 'external' && status !== 'error' ? status === 'loading' ? 'settings.externalLoading' : status === 'playing' ? 'settings.externalPlaying' : 'settings.externalCompleted' : status === 'error'
    ? errorKey
    : status === 'loading'
      ? source === 'deepseek' ? 'settings.previewLoadingDeepseek' : source === 'doubao' ? 'settings.previewLoadingDoubao' : source === 'breeze' ? 'settings.previewLoadingBreeze' : source === 'local' ? 'settings.previewLoadingLocal' : 'settings.previewLoadingMimo'
      : status === 'playing'
        ? source === 'deepseek' ? 'settings.previewPlayingDeepseek' : source === 'doubao' ? 'settings.previewPlayingDoubao' : source === 'breeze' ? 'settings.previewPlayingBreeze' : source === 'local' ? 'settings.previewPlayingLocal' : 'settings.previewPlayingMimo'
        : source === 'deepseek' ? 'settings.previewCompletedDeepseek' : source === 'doubao' ? 'settings.previewCompletedDoubao' : source === 'breeze' ? 'settings.previewCompletedBreeze' : source === 'local'
          ? 'settings.previewCompletedLocal'
          : source === 'mimo'
            ? 'settings.previewCompletedMimo'
            : 'settings.previewHint'

  const toggles = Object.fromEntries(ANNOUNCEMENT_TOGGLE_FIELDS.map(field => [field, {
    value: draft[field], overridden: overrides.includes(field),
    onChange: (value: boolean) => onSettingChange(field, value), onReset: () => resetField(field),
  } satisfies AnnouncementToggle])) as Record<AnnouncementToggleField, AnnouncementToggle>

  return <CollapsibleModule className="xmimo-tts-settings-module xmimo-tts-broadcast"
    title={<span className="xmimo-ui-module-title"><RiRadio2Line size={14} aria-hidden="true" focusable="false" /><span>{t('settings.previewTitle')}</span><span className="xmimo-ui-module-subtitle">{t('settings.broadcastSubtitle')}</span></span>}
    ariaLabel={t('settings.previewTitle')}
    searchGroups={['preview', 'providers', 'host', 'sources', 'integrations']}
    open={open} onToggle={onToggleOpen} interactiveSummary
    summary={<><span className="xmimo-ui-summary">
      <TactileButton
        className="xmimo-tts-preview-tag"
        title={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
        aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
        aria-pressed={busy}
        disabled={!enabled || (!busy && text.trim().length === 0)}
        onClick={onToggle}
      >
        <PlaybackIcon state={busy ? 'stop' : 'play'} />
        <span>{t(busy ? 'settings.previewStopShort' : 'settings.previewListen')}</span>
      </TactileButton>
      {ANNOUNCEMENT_SOURCE_OPTIONS.filter(option => draft.announcementSources.includes(option.id)).map(option => <span key={option.id}>{t(option.label)}</span>)}
      {draft.qqbotEnabled ? <span>{t('settings.qqbotIntegration')}</span> : null}
      {toggles.voiceRecognitionService.value ? <span>{t('settings.voiceRecognitionService')}</span> : null}
      {draft.announcementSources.length === 0 && !draft.qqbotEnabled ? <span>{t('settings.announcementsNone')}</span> : null}
    </span>
      {!open && status === 'error' ? <small className="xmimo-tts-preview-summary-status xmimo-tts-failed" role="status">{t(messageKey)}</small> : null}
    </>}>
    <div className="xmimo-tts-broadcast-body">
      <div className="xmimo-tts-format" hidden={hide('preview')}>
        <div className="xmimo-tts-preview-input">
          <textarea
            ref={textRef}
            value={text}
            rows={4}
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
              {external ? externalTags?.length ? <AudioTagPicker provider="external" tags={externalTags} disabled={!enabled} textRef={textRef} onInsert={insertTag} t={t} /> : null : audioTagProvider ? <AudioTagPicker key={audioTagProvider} provider={audioTagProvider} disabled={!enabled || external !== null} textRef={textRef} onInsert={insertTag} t={t} /> : null}
              <div className="xmimo-tts-preview-playback-actions">
                <TactileButton
                  className="xmimo-tts-preview-toggle"
                  title={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
                  aria-label={t(busy ? 'settings.previewStop' : 'settings.previewPlay')}
                  disabled={!enabled || (!busy && text.trim().length === 0)}
                  onClick={() => { setDownloadFailed(false); onToggle() }}
                ><PlaybackIcon state={busy ? 'stop' : 'play'} /><span>{t(busy ? 'settings.previewStopShort' : 'settings.previewListen')}</span></TactileButton>
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
      <ProviderSettings t={t} writable={writable} providerLocked={external !== null} visibleSettings={search?.visible}
        doubaoEnabled={draft.doubaoEnabled} breezeEnabled={draft.breezeEnabled} deepseekEnabled={draft.deepseekEnabled}
        mossEnabled={draft.mossEnabled} onMossEnabledChange={onMossEnabledChange} onProviderEnabledChange={onProviderEnabledChange}
        acceptExternalProviders={draft.acceptExternalProviders} onAcceptExternalProvidersChange={onAcceptExternalProvidersChange} />
      <AnnouncementSettings t={t} writable={writable} toggles={toggles} parentOpen={open}
        sources={draft.announcementSources} sourcesOverridden={overrides.includes('announcementSources')}
        onSourcesChange={onSourcesChange} onSourcesReset={onSourcesReset}
        qqbotEnabled={draft.qqbotEnabled} onQqbotChange={onQqbotChange} openApi={openApi} />
    </div>
  </CollapsibleModule>
}
