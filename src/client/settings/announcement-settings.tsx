import type { ReactElement, ReactNode } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine, RiSettings3Line } from 'react-icons/ri'
import { ANNOUNCEMENT_SOURCES, type AnnouncementSourceId } from '../../types/settings.js'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'
import { FieldInfo } from './controls/field-info.js'
import { useNestedDisclosure } from './use-nested-disclosure.js'
import { useSettingsSearch } from './settings-search-context.js'

export type AnnouncementToggleField = 'voiceRecognitionService' | 'showInHostSettings' | 'showFeatureGuide' | 'importantAnnouncementsFirst'

/** One boolean setting and the actions the heading needs to show and clear its override. */
export interface AnnouncementToggle {
  value: boolean
  overridden: boolean
  onChange: (value: boolean) => void
  onReset: () => void
}

export interface AnnouncementSettingsProps {
  children?: ReactNode
  t: Translate
  writable: boolean
  sources: AnnouncementSourceId[]
  sourcesOverridden: boolean
  onSourcesChange: (sources: AnnouncementSourceId[]) => void
  onSourcesReset: () => void
  qqbotEnabled: boolean
  onQqbotChange: (enabled: boolean) => void
  toggles: Record<AnnouncementToggleField, AnnouncementToggle>
}

const HOST_SOURCE_OPTIONS = [
  { id: 'question-titles', label: 'settings.announcementsQuestions', hint: 'settings.announcementsQuestionsHint', href: null },
  { id: 'approvals', label: 'settings.announcementsApprovals', hint: 'settings.announcementsApprovalsHint', href: null },
  { id: 'job-results', label: 'settings.announcementsJobs', hint: 'settings.announcementsJobsHint', href: null },
  { id: 'subagent-results', label: 'settings.announcementsSubagents', hint: 'settings.announcementsSubagentsHint', href: null },
] as const

const PLUGIN_SOURCE_OPTIONS = [
  { id: 'dsh-pet', label: 'settings.announcementsPet', hint: 'settings.announcementsPetHint', href: 'https://github.com/PC2005-cloud/dsh-pet' },
] as const

export const ANNOUNCEMENT_SOURCE_OPTIONS = [...HOST_SOURCE_OPTIONS, ...PLUGIN_SOURCE_OPTIONS]

const SOURCE_GROUPS = [
  { label: 'settings.announcementsTitle', hint: 'settings.announcementsHint', options: HOST_SOURCE_OPTIONS },
  { label: 'settings.announcementsPlugins', hint: 'settings.announcementsPluginsHint', options: PLUGIN_SOURCE_OPTIONS },
] as const

const HOST_TOGGLE_ROWS = [
  { field: 'voiceRecognitionService', label: 'settings.voiceRecognitionService', hint: 'settings.voiceRecognitionServiceHint' },
  { field: 'showInHostSettings', label: 'settings.showInHostSettings', hint: 'settings.showInHostSettingsHint' },
  { field: 'showFeatureGuide', label: 'settings.showFeatureGuide', hint: 'settings.showFeatureGuideHint' },
  { field: 'importantAnnouncementsFirst', label: 'settings.importantAnnouncementsFirst', hint: 'settings.importantAnnouncementsFirstHint' },
] as const satisfies readonly { field: AnnouncementToggleField, label: string, hint: string }[]

export const ANNOUNCEMENT_TOGGLE_FIELDS = HOST_TOGGLE_ROWS.map(row => row.field)

export function AnnouncementSettings({
  children, t, sources, sourcesOverridden, onSourcesChange, onSourcesReset,
  qqbotEnabled, onQqbotChange, writable, toggles, parentOpen = true,
}: AnnouncementSettingsProps & { parentOpen?: boolean }): ReactElement {
  const { result: search, hide } = useSettingsSearch()
  const showMore = search !== null && (search.groups.has('host') || search.groups.has('sources') || search.groups.has('integrations'))
  const moreSettings = useNestedDisclosure(parentOpen, showMore)
  const hostOptions = HOST_TOGGLE_ROWS.map(row => ({ ...row, ...toggles[row.field] }))
  return <details {...moreSettings} className="xmimo-tts-more-settings" hidden={search !== null && !showMore}>
    <summary className="xmimo-tts-more-settings-trigger" hidden={showMore}>
      <RiSettings3Line className="xmimo-tts-more-settings-icon" size={20} aria-hidden="true" focusable="false" />
      <span className="xmimo-tts-more-settings-copy">
        <span>{t('settings.more')}</span>
        <span className="xmimo-tts-more-settings-hint">{t('settings.announcementsMoreHint')}</span>
      </span>
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
          <Switch checked={option.value} disabled={!writable} label={t(option.label)} onChange={option.onChange} />
        </div>)}
      </section>
      {SOURCE_GROUPS.map((group, index) => <section key={group.label} className="xmimo-tts-format xmimo-tts-switch-grid" aria-label={t(group.label)} hidden={search !== null && !search.groups.has(index === 0 ? 'sources' : 'integrations')}>
        <SettingFieldHeading label={t(group.label)}
          suffix={<FieldInfo label={t(group.label)} text={t(group.hint)} />}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')} overridden={index === 0 && sourcesOverridden} resettable disabled={!writable} onReset={onSourcesReset} />
        {group.options.map(option => <div key={option.id} className="xmimo-tts-announcement-source" hidden={hide(option.id)}>
          <div>
            {option.href ? <a href={option.href} target="_blank" rel="noopener noreferrer">{t(option.label)} ↗</a> : <span>{t(option.label)}</span>}
            <small>{t(option.hint)}</small>
          </div>
          <Switch checked={sources.includes(option.id)} disabled={!writable} label={t(option.label)}
            onChange={checked => onSourcesChange(ANNOUNCEMENT_SOURCES.filter(id => id === option.id ? checked : sources.includes(id)))} />
        </div>)}
        {index === 1 ? <><div className="xmimo-tts-announcement-source" hidden={hide('qqbot')}>
          <div>
            <a href="https://github.com/tencent-connect/dsh-qqbot" target="_blank" rel="noopener noreferrer">{t('settings.qqbotIntegration')} ↗</a>
            <small>{t('settings.qqbotIntegrationHint')}</small>
          </div>
          <Switch checked={qqbotEnabled} disabled={!writable} label={t('settings.qqbotIntegration')} onChange={onQqbotChange} />
        </div>
        <div className="xmimo-tts-announcement-source" hidden={hide('dsh-whale-musume')}>
          <div>
            <a href="https://github.com/Sutera-Diffusus/dsh-whale-musume" target="_blank" rel="noopener noreferrer">{t('settings.announcementsWhale')} ↗</a>
            <small>{t('settings.announcementsWhaleHint')}</small>
          </div>
        </div>
        <div className="xmimo-tts-announcement-source" hidden={hide('passport')}>
          <div>
            <a href="https://github.com/ppy-web/whaletalk-passport#readme" target="_blank" rel="noopener noreferrer">{t('settings.passportIntegration')} ↗</a>
            <small>{t('settings.passportIntegrationHint')}</small>
          </div>
        </div>
        <div className="xmimo-tts-announcement-source" hidden={hide('novel')}>
          <div>
            <a href="https://github.com/xrn1997/dsh-novel#readme" target="_blank" rel="noopener noreferrer">{t('settings.novelIntegration')} ↗</a>
            <small>{t('settings.novelIntegrationHint')}</small>
          </div>
        </div>
        <div className="xmimo-tts-announcement-source" hidden={hide('audio-reactive')}>
          <div>
            <a href="https://github.com/ppy-web/dsh-audio-reactive" target="_blank" rel="noopener noreferrer">{t('settings.audioReactiveIntegration')} ↗</a>
            <small>{t('settings.audioReactiveIntegrationHint')}</small>
          </div>
        </div></> : null}
      </section>)}
    </div>
  </details>
}
