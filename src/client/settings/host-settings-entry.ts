import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../shared.js'
import { observeSettingsSlice } from './scope.js'

/** Mount an entry only while its saved Host settings preference is enabled. */
export function observeHostSettingsEntry(scope: ConfigForm<TtsSettings>, register: () => () => void): () => void {
  let remove: (() => void) | undefined
  const off = observeSettingsSlice(scope, snapshot => snapshot.status === 'ready' && snapshot.value?.showInHostSettings !== false, visible => {
    if (visible && remove === undefined) remove = register()
    if (!visible) { remove?.(); remove = undefined }
  })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off(); remove?.(); remove = undefined
  }
}
