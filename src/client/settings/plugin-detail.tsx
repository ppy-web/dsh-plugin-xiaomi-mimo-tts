import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { AiFillGithub } from 'react-icons/ai'
import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { LocaleKey, Translate } from '../localization.js'
import { useApiKeyStatus } from '../conversation/api-key-status.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { ApiKeyStatus } from './api-key-state.js'
import { apiKeyStatusStore } from './api-key-status-store.js'
import { MANUAL_URL, SOURCE_URL } from './plugin-links.js'
import { useSettingsSnapshot } from './scope.js'

interface DetailProps extends PluginDetailProps {
  t: Translate
}

interface DetailBadgeProps extends DetailProps {
  scope: ConfigForm<TtsSettings>
  changes?: SnapshotSource<boolean> | undefined
}

function isTtsBundle({ subject }: PluginDetailProps): boolean {
  return subject.kind === 'bundle' && subject.pkg.name === 'dsh-xiaomi-tts'
}

export function PluginDetailActions(props: DetailProps): ReactElement | null {
  if (!isTtsBundle(props)) return null
  return <div className="xmimo-ui-scope xmimo-tts-detail-actions">
    <Button variant="outline" size="sm" className="xmimo-tts-star" onClick={() => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')}>
      <AiFillGithub size={14} aria-hidden="true" focusable="false" />
      {props.t('settings.source')}
    </Button>
    <Button variant="outline" size="sm" onClick={() => window.open(MANUAL_URL, '_blank', 'noopener,noreferrer')}>{props.t('detail.manual')}</Button>
  </div>
}

const STATUS_KEYS: Record<ApiKeyStatus, LocaleKey> = {
  loading: 'detail.keyLoading',
  missing: 'detail.keyMissing',
  recognized: 'detail.keyRecognized',
  unrecognized: 'detail.keyUnrecognized',
  unavailable: 'detail.keyUnavailable',
}

export function PluginDetailBadge(props: DetailBadgeProps): ReactElement | null {
  if (!isTtsBundle(props)) return null
  return <KeyBadge scope={props.scope} t={props.t} changes={props.changes} />
}

function KeyBadge({ scope, t, changes = IDLE_PLUGIN_CHANGES }: Omit<DetailBadgeProps, 'subject'>): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const { provider } = resolveTtsSettings(snapshot.value)
  const status = useApiKeyStatus(snapshot.status === 'ready' && !changing, provider)
  const key = changing ? 'plugin.changing' : snapshot.status === 'unavailable' ? 'detail.keyUnavailable' : STATUS_KEYS[status]
  return <span className="xmimo-ui-scope xmimo-tts-detail-status">
    <span role="status">{t(provider === 'doubao' ? 'settings.providerDoubao' : 'settings.providerXiaomi')} · {t(key)}</span>
    {!changing && snapshot.status === 'ready' && status === 'unavailable'
      ? <Button type="button" variant="toolbar" size="sm" onClick={apiKeyStatusStore.invalidate}>{t('detail.retry')}</Button>
      : null}
  </span>
}
