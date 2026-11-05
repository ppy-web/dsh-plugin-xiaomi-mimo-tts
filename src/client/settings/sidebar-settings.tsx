import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu'
import type { Translate } from '../localization.js'

export interface SidebarSettingsProps {
  t: Translate
  value: boolean
  disabled: boolean
  onToggle: () => void
}

/** Save and move the workbench between plugin details and the sidebar. */
export function SidebarSettings({ t, value, disabled, onToggle }: SidebarSettingsProps): ReactElement {
  const Icon = value ? LuPanelLeftClose : LuPanelLeftOpen
  return <Button type="button" variant="toolbar" size="sm" disabled={disabled} aria-pressed={value} onClick={onToggle}>
    <Icon size={14} aria-hidden="true" focusable="false" />
    <span className="xmimo-tts-action-label">{t(value ? 'settings.unmountSidebar' : 'settings.mountSidebar')}</span>
  </Button>
}
