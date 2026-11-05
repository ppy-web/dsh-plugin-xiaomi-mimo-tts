import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveTtsSettings } from '../../shared.js'
import { NS } from '../localization.js'
import { SettingsCard } from './card.js'
import type { SettingsCardProps } from './card.js'
import { useSettingsSnapshot } from './scope.js'

/** Mounted workbenches are configured in their own panel instead of twice. */
export function BundleSettingsCard(props: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(props.scope)
  if (props.view === 'page' && snapshot.status === 'ready' && resolveTtsSettings(snapshot.value).showInSidebar) return null
  return <SettingsCard {...props} />
}

/** Withdraw the contribution so the Host also removes its empty config section. */
export function registerBundleSettings(ctx: Context, props: Omit<SettingsCardProps, 'view'>): () => void {
  let remove: (() => void) | undefined
  const update = (): void => {
    const snapshot = props.scope.getSnapshot()
    const mounted = snapshot.status === 'ready' && resolveTtsSettings(snapshot.value).showInSidebar
    if (mounted) { remove?.(); remove = undefined }
    else if (!remove) remove = ctx.slots.register({
      name: 'plugins.bundle.config', key: 'dsh-xiaomi-tts', locale: NS, inject: () => props,
    }, BundleSettingsCard)
  }
  const off = props.scope.subscribe(update)
  try { update() } catch (error) { off(); throw error }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off(); remove?.(); remove = undefined
  }
}
