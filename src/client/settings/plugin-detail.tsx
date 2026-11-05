import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { AiFillGithub } from 'react-icons/ai'
import { LuBookOpen, LuAudioLines } from 'react-icons/lu'
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
import { providerLabelKey } from './provider-label.js'
import { useSettingsSnapshot } from './scope.js'

interface DetailProps extends PluginDetailProps {
  t: Translate
  scope?: ConfigForm<TtsSettings> | undefined
  onOpenWorkbench?: (() => void) | undefined
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
  const sourceLabel = props.t('settings.source')
  const manualLabel = props.t('detail.manual')
  return <div className="xmimo-ui-scope xmimo-tts-detail-actions">
    <Button variant="outline" size="sm" className="xmimo-tts-star" aria-label={sourceLabel} title={sourceLabel} onClick={() => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')}>
      <AiFillGithub size={14} aria-hidden="true" focusable="false" />
      <span className="xmimo-tts-detail-action-label">{sourceLabel}</span>
    </Button>
    <Button variant="outline" size="sm" aria-label={manualLabel} title={manualLabel} onClick={() => window.open(MANUAL_URL, '_blank', 'noopener,noreferrer')}>
      <LuBookOpen size={14} aria-hidden="true" focusable="false" />
      <span className="xmimo-tts-detail-action-label">{manualLabel}</span>
    </Button>
    {props.scope ? <WorkbenchAction scope={props.scope} t={props.t} onOpen={props.onOpenWorkbench} /> : null}
  </div>
}

function WorkbenchAction({ scope, t, onOpen }: { scope: ConfigForm<TtsSettings>; t: Translate; onOpen: (() => void) | undefined }): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  if (snapshot.status !== 'ready' || !resolveTtsSettings(snapshot.value).showInSidebar || !onOpen) return null
  return <Button type="button" variant="outline" size="sm" onClick={onOpen}>
    <LuAudioLines size={14} aria-hidden="true" focusable="false" />
    <span>{t('settings.voiceSettingsNav')}</span>
  </Button>
}

const STATUS_KEYS: Record<ApiKeyStatus, LocaleKey> = {
  loading: 'detail.keyLoading',
  missing: 'detail.keyMissing',
  recognized: 'detail.keyRecognized',
  unrecognized: 'detail.keyUnrecognized',
  unavailable: 'detail.keyUnavailable',
}

export function PluginDetailBadge(props: DetailBadgeProps): ReactElement | null {
  if (props.subject.kind === 'row' && props.subject.pkg.name === 'dsh-xiaomi-tts' && ['dsh-xiaomi-tts/qqbot', 'dsh-xiaomi-tts/passport'].includes(props.subject.row.moduleName)) {
    return <Tag tone="info" className="xmimo-tts-experimental-tag">{props.t('settings.experimental')}</Tag>
  }
  if (!isTtsBundle(props)) return null
  return <>
    <KeyBadge scope={props.scope} t={props.t} changes={props.changes} />
    <ExperimentalComponentListBadge label={props.t('settings.experimental')} />
  </>
}

/** The host exposes a detail badge slot but no component-list badge slot. */
export function ExperimentalComponentListBadge({ label }: { label: string }): ReactElement {
  return <style>{`[data-plugin-detail="dsh-xiaomi-tts"] { --xmimo-experimental-label: ${JSON.stringify(label)}; }`}</style>
}

function KeyBadge({ scope, t, changes = IDLE_PLUGIN_CHANGES }: Omit<DetailBadgeProps, 'subject'>): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const { provider } = resolveTtsSettings(snapshot.value)
  const status = useApiKeyStatus(snapshot.status === 'ready' && !changing, provider)
  const key = changing ? 'plugin.changing' : snapshot.status === 'unavailable' ? 'detail.keyUnavailable' : STATUS_KEYS[status]
  return <span className="xmimo-ui-scope xmimo-tts-detail-status">
    <span role="status">{t(providerLabelKey(provider))} · {t(key)}</span>
    {!changing && snapshot.status === 'ready' && status === 'unavailable'
      ? <Button type="button" variant="toolbar" size="sm" onClick={apiKeyStatusStore.invalidate}>{t('detail.retry')}</Button>
      : null}
  </span>
}
