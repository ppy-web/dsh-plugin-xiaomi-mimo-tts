import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import { useSettingsSnapshot } from '../settings/scope.js'
import { readMinimalMode, subscribeMinimalMode } from '../settings/minimal-mode.js'
import { AudioHistoryPage } from './audio-history-page.js'
import type { AudioHistory } from './audio-history.js'

export interface AudioHistoryTabProps {
  history: AudioHistory
  t: Translate
  scope: ConfigForm<TtsSettings>
  beforePlayback: () => boolean | void
  speechActivity?: SpeechActivity | undefined
  changes?: SnapshotSource<boolean> | undefined
}

/** The host owns tab navigation; the recording store remains owned by the plugin. */
export function AudioHistoryTab({ history, t, scope, beforePlayback, speechActivity, changes = IDLE_PLUGIN_CHANGES }: AudioHistoryTabProps): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const settings = resolveTtsSettings(snapshot.value)
  const minimalMode = useSyncExternalStore(subscribeMinimalMode, readMinimalMode, readMinimalMode)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  if (changing) return <p className="xmimo-ui-scope xmimo-tts-plugin-status" role="status">{t('plugin.changing')}</p>
  return <AudioHistoryPage history={history} t={t} volume={settings.voiceVolume} voiceRate={settings.voiceRate}
    minimalMode={minimalMode} beforePlayback={beforePlayback} speechActivity={speechActivity} />
}
