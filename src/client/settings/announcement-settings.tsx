import type { ReactElement, ReactNode } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowDownSLine } from 'react-icons/ri'
import { ANNOUNCEMENT_SOURCES, type AnnouncementSourceId } from '../../types/settings.js'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'
import { FieldInfo } from './controls/field-info.js'
import { useNestedDisclosure } from './use-nested-disclosure.js'

export interface AnnouncementSettingsProps {
  children?: ReactNode
  t: Translate
  sources: AnnouncementSourceId[]
  qqbotEnabled: boolean
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

export function AnnouncementSettings({ children, t, sources, qqbotEnabled, onQqbotChange, writable, overridden, onChange, onReset, parentOpen = true }: AnnouncementSettingsProps & { parentOpen?: boolean }): ReactElement {
  const moreSettings = useNestedDisclosure(parentOpen)
  return <details ref={moreSettings} className="xmimo-tts-more-settings">
    <summary className="xmimo-tts-builtin-voice-trigger">
      <span>{t('settings.more')}</span>
      <span className="xmimo-tts-more-settings-hint">{t('settings.announcementsMoreHint')}</span>
      <RiArrowDownSLine className="xmimo-tts-voice-picker-chevron" size={16} aria-hidden="true" focusable="false" />
    </summary>
    <div className="xmimo-tts-more-settings-body">
      {children}
      {SOURCE_GROUPS.map((group, index) => <section key={group.label} className="xmimo-tts-format xmimo-tts-switch-grid" aria-label={t(group.label)}>
        <SettingFieldHeading label={t(group.label)}
          suffix={<FieldInfo label={t(group.label)} text={t(group.hint)} />}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')} overridden={index === 0 && overridden} resettable disabled={!writable} onReset={onReset} />
        {group.options.map(option => <div key={option.id} className="xmimo-tts-announcement-source">
          <div>
            {option.href ? <a href={option.href} target="_blank" rel="noopener noreferrer">{t(option.label)} ↗</a> : <span>{t(option.label)}</span>}
            <small>{t(option.hint)}</small>
          </div>
          <Switch checked={sources.includes(option.id)} disabled={!writable} label={t(option.label)}
            onChange={checked => onChange(ANNOUNCEMENT_SOURCES.filter(id => id === option.id ? checked : sources.includes(id)))} />
        </div>)}
        {index === 1 ? <><div className="xmimo-tts-announcement-source">
          <div>
            <a href="https://github.com/tencent-connect/dsh-qqbot" target="_blank" rel="noopener noreferrer">{t('settings.qqbotIntegration')} ↗</a>
            <small>{t('settings.qqbotIntegrationHint')}</small>
          </div>
          <Switch checked={qqbotEnabled} disabled={!writable} label={t('settings.qqbotIntegration')} onChange={onQqbotChange} />
        </div>
        <div className="xmimo-tts-announcement-source">
          <div>
            <a href="https://github.com/ppy-web/whaletalk-passport#readme" target="_blank" rel="noopener noreferrer">{t('settings.passportIntegration')} ↗</a>
            <small>{t('settings.passportIntegrationHint')}</small>
          </div>
        </div></> : null}
      </section>)}
    </div>
  </details>
}
