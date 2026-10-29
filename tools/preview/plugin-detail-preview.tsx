import { useEffect, useSyncExternalStore } from 'react'
import type { PluginsSubject } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { PluginDetailActions, PluginDetailBadge } from '../../src/client/settings/plugin-detail.js'
import type { ApiKeyStatus } from '../../src/client/settings/api-key-state.js'
import type { LocaleKey, Translate } from '../../src/client/localization.js'
import { useSettingsSnapshot } from '../../src/client/settings/scope.js'
import type { PreviewSettingsScope } from './mock-settings.js'

const listeners = new Set<() => void>()
let changing = false
export const previewPluginChanges = {
  getSnapshot: () => changing,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  set: (next: boolean) => { changing = next; for (const listener of listeners) listener() },
}

const pkg = { name: 'dsh-xiaomi-tts', installed: true, availability: 'available', official: false, enabled: true, rows: [] } as const
const subject = { kind: 'bundle', pkg } satisfies PluginsSubject

const statusKeys: Record<ApiKeyStatus, LocaleKey> = {
  loading: 'detail.keyLoading', missing: 'detail.keyMissing', recognized: 'detail.keyRecognized',
  unrecognized: 'detail.keyUnrecognized', unavailable: 'detail.keyUnavailable',
}

/** A host-shaped harness for the real detail contributions, with no cloud credentials. */
export function PluginDetailPreview({ scope, t }: { scope: PreviewSettingsScope; t: Translate }) {
  const activity = useSyncExternalStore(previewPluginChanges.subscribe, previewPluginChanges.getSnapshot)
  const snapshot = useSettingsSnapshot(scope)
  useEffect(() => {
    scope.setKeyStatusPreview('missing')
    return () => { previewPluginChanges.set(false); scope.setKeyStatusPreview(null) }
  }, [scope])
  return <div className="preview-detail xmimo-ui-scope">
    <div className="preview-detail-controls">
      <label>{t('settings.provider')}<select value={snapshot.value?.provider ?? 'xiaomi'} disabled={!snapshot.writable || activity} onChange={event => { void scope.set('provider', event.target.value) }}>
        <option value="xiaomi">{t('settings.providerXiaomi')}</option>
        <option value="doubao">{t('settings.providerDoubao')}</option>
      </select></label>
      <label>{t('detail.previewKey')}<select value={scope.keyStatusPreview ?? 'missing'} onChange={event => {
        const next = event.target.value as ApiKeyStatus
        scope.setKeyStatusPreview(next)
      }}>
        {Object.entries(statusKeys).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
      </select></label>
      <label className="preview-detail-checkbox"><input type="checkbox" checked={activity} onChange={event => previewPluginChanges.set(event.target.checked)} />{t('detail.previewChanging')}</label>
    </div>
    <header className="preview-detail-header">
      <div><h2>MiMo & Seed TTS</h2>
        <PluginDetailBadge subject={subject} t={t} scope={scope} changes={previewPluginChanges} />
      </div>
      <PluginDetailActions subject={subject} t={t} />
    </header>
  </div>
}
