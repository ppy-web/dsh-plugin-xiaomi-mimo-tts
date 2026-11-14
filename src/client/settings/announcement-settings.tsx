import type { ReactElement, ReactNode } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine } from 'react-icons/ri'
import { ANNOUNCEMENT_SOURCES, type AnnouncementSourceId } from '../../types/settings.js'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'
import { FieldInfo } from './controls/field-info.js'
import { useNestedDisclosure } from './use-nested-disclosure.js'
import { useSettingsSearch } from './settings-search-context.js'

export interface AnnouncementSettingsProps {
  children?: ReactNode
  t: Translate
  sources: AnnouncementSourceId[]
  qqbotEnabled: boolean
  voiceInputCompatibility: boolean
  onVoiceInputCompatibilityChange: (enabled: boolean) => void
  voiceInputCompatibilityOverridden: boolean
  onVoiceInputCompatibilityReset: () => void
  showReadingCaptions: boolean
  onShowReadingCaptionsChange: (enabled: boolean) => void
  showReadingCaptionsOverridden: boolean
  onShowReadingCaptionsReset: () => void
  showInHostSettings: boolean
  showFeatureGuide: boolean
  onShowFeatureGuideChange: (enabled: boolean) => void
  showFeatureGuideOverridden: boolean
  onShowFeatureGuideReset: () => void
  acceptExternalProviders: boolean
  onAcceptExternalProvidersChange: (enabled: boolean) => void
  acceptExternalProvidersOverridden: boolean
  onAcceptExternalProvidersReset: () => void
  voiceRecognitionService: boolean
  onVoiceRecognitionServiceChange: (enabled: boolean) => void
  voiceRecognitionServiceOverridden: boolean
  onVoiceRecognitionServiceReset: () => void
  onShowInHostSettingsChange: (enabled: boolean) => void
  showInHostSettingsOverridden: boolean
  onShowInHostSettingsReset: () => void
  inputAvoidance: boolean
  onInputAvoidanceChange: (enabled: boolean) => void
  inputAvoidanceOverridden: boolean
  onInputAvoidanceReset: () => void
  importantAnnouncementsFirst: boolean
  onImportantAnnouncementsFirstChange: (enabled: boolean) => void
  importantAnnouncementsFirstOverridden: boolean
  onImportantAnnouncementsFirstReset: () => void
  onQqbotChange: (enabled: boolean) => void
  writable: boolean
  overridden: boolean
  onChange: (sources: AnnouncementSourceId[]) => void
  onReset: () => void
}

const HOST_SOURCE_OPTIONS = [
  { id: 'question-titles', label: 'settings.announcementsQuestions', hint: 'settings.announcementsQuestionsHint', href: null },
  { id: 'approvals', label: 'settings.announcementsApprovals', hint: 'settings.announcementsApprovalsHint', href: null },
  { id: 'job-results', label: 'settings.announcementsJobs', hint: 'settings.announcementsJobsHint', href: null },
  { id: 'subagent-results', label: 'settings.announcementsSubagents', hint: 'settings.announcementsSubagentsHint', href: null },
] as const

const PLUGIN_SOURCE_OPTIONS = [
  { id: 'dsh-pet', label: 'settings.announcementsPet', hint: 'settings.announcementsPetHint', href: 'https://github.com/PC2005-cloud/dsh-pet' },
  { id: 'dsh-whale-musume', label: 'settings.announcementsWhale', hint: 'settings.announcementsWhaleHint', href: 'https://github.com/Sutera-Diffusus/dsh-whale-musume' },
] as const

export const ANNOUNCEMENT_SOURCE_OPTIONS = [...HOST_SOURCE_OPTIONS, ...PLUGIN_SOURCE_OPTIONS]

const SOURCE_GROUPS = [
  { label: 'settings.announcementsTitle', hint: 'settings.announcementsHint', options: HOST_SOURCE_OPTIONS },
  { label: 'settings.announcementsPlugins', hint: 'settings.announcementsPluginsHint', options: PLUGIN_SOURCE_OPTIONS },
] as const

export function AnnouncementSettings({ children, t, sources, qqbotEnabled, onQqbotChange, voiceInputCompatibility, onVoiceInputCompatibilityChange, voiceInputCompatibilityOverridden, onVoiceInputCompatibilityReset, showReadingCaptions, onShowReadingCaptionsChange, showReadingCaptionsOverridden, onShowReadingCaptionsReset, showInHostSettings, onShowInHostSettingsChange, showInHostSettingsOverridden, onShowInHostSettingsReset, showFeatureGuide, onShowFeatureGuideChange, showFeatureGuideOverridden, onShowFeatureGuideReset, acceptExternalProviders, onAcceptExternalProvidersChange, acceptExternalProvidersOverridden, onAcceptExternalProvidersReset, voiceRecognitionService, onVoiceRecognitionServiceChange, voiceRecognitionServiceOverridden, onVoiceRecognitionServiceReset, inputAvoidance, onInputAvoidanceChange, inputAvoidanceOverridden, onInputAvoidanceReset, importantAnnouncementsFirst, onImportantAnnouncementsFirstChange, importantAnnouncementsFirstOverridden, onImportantAnnouncementsFirstReset, writable, overridden, onChange, onReset, parentOpen = true }: AnnouncementSettingsProps & { parentOpen?: boolean }): ReactElement {
  const { result: search, hide } = useSettingsSearch()
  const showMore = search !== null && (search.groups.has('host') || search.groups.has('sources') || search.groups.has('integrations'))
  const moreSettings = useNestedDisclosure(parentOpen, showMore)
  const hostOptions = [
    { label: 'settings.voiceInputCompatibility', hint: 'settings.voiceInputCompatibilityHint', checked: voiceInputCompatibility, overridden: voiceInputCompatibilityOverridden, onChange: onVoiceInputCompatibilityChange, onReset: onVoiceInputCompatibilityReset },
    { label: 'settings.readingCaptions', hint: 'settings.readingCaptionsHint', checked: showReadingCaptions, overridden: showReadingCaptionsOverridden, onChange: onShowReadingCaptionsChange, onReset: onShowReadingCaptionsReset },
    { label: 'settings.voiceRecognitionService', hint: 'settings.voiceRecognitionServiceHint', checked: voiceRecognitionService, overridden: voiceRecognitionServiceOverridden, onChange: onVoiceRecognitionServiceChange, onReset: onVoiceRecognitionServiceReset },
    { label: 'settings.showInHostSettings', hint: 'settings.showInHostSettingsHint', checked: showInHostSettings, overridden: showInHostSettingsOverridden, onChange: onShowInHostSettingsChange, onReset: onShowInHostSettingsReset },
    { label: 'settings.showFeatureGuide', hint: 'settings.showFeatureGuideHint', checked: showFeatureGuide, overridden: showFeatureGuideOverridden, onChange: onShowFeatureGuideChange, onReset: onShowFeatureGuideReset },
    { label: 'settings.acceptExternalProviders', hint: 'settings.acceptExternalProvidersHint', checked: acceptExternalProviders, overridden: acceptExternalProvidersOverridden, onChange: onAcceptExternalProvidersChange, onReset: onAcceptExternalProvidersReset },
    { label: 'settings.inputAvoidance', hint: 'settings.inputAvoidanceHint', checked: inputAvoidance, overridden: inputAvoidanceOverridden, onChange: onInputAvoidanceChange, onReset: onInputAvoidanceReset },
    { label: 'settings.importantAnnouncementsFirst', hint: 'settings.importantAnnouncementsFirstHint', checked: importantAnnouncementsFirst, overridden: importantAnnouncementsFirstOverridden, onChange: onImportantAnnouncementsFirstChange, onReset: onImportantAnnouncementsFirstReset },
  ] as const
  return <details {...moreSettings} className="xmimo-tts-more-settings" hidden={search !== null && !showMore}>
    <summary className="xmimo-tts-builtin-voice-trigger" hidden={showMore}>
      <span>{t('settings.more')}</span>
      <span className="xmimo-tts-more-settings-hint">{t('settings.announcementsMoreHint')}</span>
      <RiArrowDownSLine className="xmimo-tts-voice-picker-chevron" size={16} aria-hidden="true" focusable="false" />
    </summary>
    <div className="xmimo-tts-more-settings-body">
      {children}
      <section className="xmimo-tts-format xmimo-tts-switch-grid" aria-label={t('settings.hostIntegration')} hidden={search !== null && !search.groups.has('host')}>
        <SettingFieldHeading label={t('settings.hostIntegration')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')}
          overridden={hostOptions.some(option => option.overridden)} resettable disabled={!writable}
          onReset={() => { for (const option of hostOptions) if (option.overridden) option.onReset() }} />
        {hostOptions.map(option => <div key={option.label} className="xmimo-tts-announcement-source" hidden={hide(option.label)}>
          <div>
            <span>{t(option.label)}</span>
            <small>{t(option.hint)}</small>
          </div>
          <Switch checked={option.checked} disabled={!writable} label={t(option.label)} onChange={option.onChange} />
        </div>)}
      </section>
      {SOURCE_GROUPS.map((group, index) => <section key={group.label} className="xmimo-tts-format xmimo-tts-switch-grid" aria-label={t(group.label)} hidden={search !== null && !search.groups.has(index === 0 ? 'sources' : 'integrations')}>
        <SettingFieldHeading label={t(group.label)}
          suffix={<FieldInfo label={t(group.label)} text={t(group.hint)} />}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')} overridden={index === 0 && overridden} resettable disabled={!writable} onReset={onReset} />
        {group.options.map(option => <div key={option.id} className="xmimo-tts-announcement-source" hidden={hide(option.id)}>
          <div>
            {option.href ? <a href={option.href} target="_blank" rel="noopener noreferrer">{t(option.label)} ↗</a> : <span>{t(option.label)}</span>}
            <small>{t(option.hint)}</small>
          </div>
          <Switch checked={sources.includes(option.id)} disabled={!writable} label={t(option.label)}
            onChange={checked => onChange(ANNOUNCEMENT_SOURCES.filter(id => id === option.id ? checked : sources.includes(id)))} />
        </div>)}
        {index === 1 ? <><div className="xmimo-tts-announcement-source" hidden={hide('qqbot')}>
          <div>
            <a href="https://github.com/tencent-connect/dsh-qqbot" target="_blank" rel="noopener noreferrer">{t('settings.qqbotIntegration')} ↗</a>
            <small>{t('settings.qqbotIntegrationHint')}</small>
          </div>
          <Switch checked={qqbotEnabled} disabled={!writable} label={t('settings.qqbotIntegration')} onChange={onQqbotChange} />
        </div>
        <div className="xmimo-tts-announcement-source" hidden={hide('passport')}>
          <div>
            <a href="https://github.com/ppy-web/whaletalk-passport#readme" target="_blank" rel="noopener noreferrer">{t('settings.passportIntegration')} ↗</a>
            <small>{t('settings.passportIntegrationHint')}</small>
          </div>
        </div></> : null}
      </section>)}
    </div>
  </details>
}
