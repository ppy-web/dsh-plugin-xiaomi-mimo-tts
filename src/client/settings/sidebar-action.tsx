import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ReactElement } from 'react'
import { useLayoutEffect } from 'react'
import { RiVoiceAiFill } from 'react-icons/ri'
import { resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { NS } from '../localization.js'
import type { Translate } from '../localization.js'

export const VOICE_SETTINGS_PANEL_ID = 'xiaomi-mimo-tts.settings'

/** The sidebar owns the navigation row and its collapsed-rail tooltip. */
export function VoiceSettingsSidebarIcon({ size }: { size: number }): ReactElement {
  return <RiVoiceAiFill size={size} aria-hidden="true" focusable="false" />
}

/** Resolve the shortcut through the host's panel contract, then open the bundle. */
export function VoiceSettingsRedirect({ open }: { open: () => void }): null {
  useLayoutEffect(() => { open() }, [open])
  return null
}

export function registerVoiceSettingsSidebar(ctx: Context, scope: ConfigForm<TtsSettings>, t: Translate): () => void {
  let remove: (() => void) | undefined
  const open = (): void => { ctx.pluginNavigation.openBundle('dsh-xiaomi-tts') }
  const update = (): void => {
    const snapshot = scope.getSnapshot()
    const visible = snapshot.status === 'ready' && resolveTtsSettings(snapshot.value).showInSidebar
    if (visible && !remove) {
      // Register the destination first: the host rejects navigation to missing panels.
      const removePanel = ctx.slots.register({ name: 'main', key: VOICE_SETTINGS_PANEL_ID, inject: () => ({ open }) }, VoiceSettingsRedirect)
      let removeEntry: () => void
      try {
        removeEntry = ctx.slots.register({ name: 'sidebar.panellist', id: VOICE_SETTINGS_PANEL_ID, order: -10, label: () => t('settings.voiceSettingsNav'), locale: NS }, VoiceSettingsSidebarIcon)
      } catch (error) { removePanel(); throw error }
      remove = () => { removeEntry(); removePanel() }
    }
    if (!visible) { remove?.(); remove = undefined }
  }
  const off = scope.subscribe(update)
  try { update() } catch (error) { off(); throw error }
  return () => { off(); remove?.(); remove = undefined }
}
