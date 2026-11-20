import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { NS } from '../localization.js'
import { lazyPanel } from '../lazy-panel.js'
import type { SettingsCardProps } from './card.js'
import { observeSettingsSlice, useSettingsSlice } from './scope.js'
import { sidebarMounted } from './sidebar-action.js'

const SettingsCard = lazyPanel(() => import('./voice-settings-page.js').then(module => module.SettingsCard))

/** Mounted workbenches are configured in their own panel instead of twice. */
export function BundleSettingsCard(props: SettingsCardProps): ReactElement | null {
  const mounted = useSettingsSlice(props.scope, sidebarMounted)
  if (props.view === 'summary') return <>{props.t('settings.description')}</>
  if (mounted) return null
  return <SettingsCard {...props} />
}

/** Withdraw the contribution so the Host also removes its empty config section. */
export function registerBundleSettings(ctx: Context, props: Omit<SettingsCardProps, 'view'>): () => void {
  let remove: (() => void) | undefined
  const off = observeSettingsSlice(props.scope, sidebarMounted, mounted => {
    if (mounted) { remove?.(); remove = undefined }
    else if (!remove) remove = ctx.slots.register({
      name: 'plugins.bundle.config', key: 'dsh-xiaomi-tts', locale: NS, inject: () => props,
    }, BundleSettingsCard)
  })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off(); remove?.(); remove = undefined
  }
}
