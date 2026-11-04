import type { ReactElement } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '../localization.js'
import { SettingFieldHeading } from './field-heading.js'

export interface SidebarSettingsProps {
  t: Translate
  value: boolean
  writable: boolean
  overridden: boolean
  onChange: (value: boolean) => void
  onReset: () => void
}

/** A sidebar preference shown before announcement sources in the broadcast More group. */
export function SidebarSettings({ t, value, writable, overridden, onChange, onReset }: SidebarSettingsProps): ReactElement {
  return <section className="xmimo-tts-format xmimo-tts-switch-grid" aria-label={t('settings.showInSidebar')}>
    <div className="xmimo-tts-announcement-source">
      <div>
        <SettingFieldHeading label={t('settings.showInSidebar')} overridden={overridden}
          overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} resettable disabled={!writable} onReset={onReset} />
        <small>{t('settings.showInSidebarHint')}</small>
      </div>
      <Switch checked={value} disabled={!writable} label={t('settings.showInSidebar')} onChange={onChange} />
    </div>
  </section>
}
