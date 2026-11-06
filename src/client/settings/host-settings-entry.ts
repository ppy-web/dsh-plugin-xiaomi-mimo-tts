import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'

/** Mount an entry only while its saved Host settings preference is enabled. */
export function observeHostSettingsEntry(scope: ConfigForm<TtsSettings>, register: () => () => void): () => void {
  let remove: (() => void) | undefined
  const update = (): void => {
    const snapshot = scope.getSnapshot()
    const visible = snapshot.status === 'ready' && resolveTtsSettings(snapshot.value).showInHostSettings
    if (visible && remove === undefined) remove = register()
    if (!visible) { remove?.(); remove = undefined }
  }
  const off = scope.subscribe(update)
  try { update() } catch (error) { off(); throw error }
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off(); remove?.(); remove = undefined
  }
}
