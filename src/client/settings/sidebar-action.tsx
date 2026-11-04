import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ReactElement } from 'react'
import { RiVoiceAiFill } from 'react-icons/ri'
import { resolveTtsSettings } from '../../shared.js'
import { NS } from '../localization.js'
import { VoiceSettingsPage } from './voice-settings-page.js'
import type { VoiceSettingsPageProps } from './voice-settings-page.js'

export const VOICE_SETTINGS_PANEL_ID = 'xiaomi-mimo-tts.settings'

/** The sidebar owns the navigation row and its collapsed-rail tooltip. */
export function VoiceSettingsSidebarIcon({ size }: { size: number }): ReactElement {
  return <RiVoiceAiFill size={size} aria-hidden="true" focusable="false" />
}

export function registerVoiceSettingsSidebar(ctx: Context, props: Omit<VoiceSettingsPageProps, 'onOpenPluginSettings'>): () => void {
  const { scope, t } = props
  // The page stays available when its shortcut is hidden, including just after saving that preference.
  const pageProps: VoiceSettingsPageProps = { ...props, onOpenPluginSettings: () => ctx.pluginNavigation.openBundle('dsh-xiaomi-tts') }
  const removePanel = ctx.slots.register({ name: 'main', key: VOICE_SETTINGS_PANEL_ID, inject: () => pageProps }, VoiceSettingsPage)
  let remove: (() => void) | undefined
  const update = (): void => {
    const snapshot = scope.getSnapshot()
    const visible = snapshot.status === 'ready' && resolveTtsSettings(snapshot.value).showInSidebar
    if (visible && !remove) {
      remove = ctx.slots.register({ name: 'sidebar.panellist', id: VOICE_SETTINGS_PANEL_ID, order: -10, label: () => t('settings.voiceSettingsNav'), locale: NS }, VoiceSettingsSidebarIcon)
    }
    if (!visible) { remove?.(); remove = undefined }
  }
  const off = scope.subscribe(update)
  try { update() } catch (error) { off(); removePanel(); throw error }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off(); remove?.(); remove = undefined; removePanel()
  }
}
