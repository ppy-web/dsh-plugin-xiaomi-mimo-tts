import { useState, useSyncExternalStore, type ReactElement } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { useSettingsSnapshot } from './scope.js'
import { saveQqSpeechDraft, validQqSpeechDraft, type QqSpeechDraft } from './qqbot-speech-draft.js'

interface Props extends PluginConfigViewProps {
  scope: ConfigForm<TtsSettings>
  t: Translate
  changes?: SnapshotSource<boolean>
}
export function QqbotSpeechSettings(props: Props): ReactElement {
  if (props.view === 'summary') return <>{props.t('qq.description')}</>
  return <QqbotSpeechPage {...props} />
}
function QqbotSpeechPage({ scope, t, changes = IDLE_PLUGIN_CHANGES }: Props): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const [draft, setDraft] = useState<{ base: QqSpeechDraft; value: QqSpeechDraft; revision: number } | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const resolved = resolveTtsSettings(snapshot.value)
  const accepted: QqSpeechDraft = { qqbotEnabled: resolved.qqbotEnabled, qqbotMaxAutoCharacters: resolved.qqbotMaxAutoCharacters, qqbotMaxDurationSeconds: resolved.qqbotMaxDurationSeconds }
  const value = draft?.value ?? accepted
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || changing || state === 'saving'
  const dirty = draft !== null && JSON.stringify(draft.base) !== JSON.stringify(value)
  const conflict = draft !== null && draft.revision !== snapshot.revision
  const valid = validQqSpeechDraft(value)
  const edit = <K extends keyof QqSpeechDraft>(field: K, next: QqSpeechDraft[K]): void => {
    if (disabled || snapshot.revision === undefined) return
    const revision = snapshot.revision
    setDraft(previous => ({ base: previous?.base ?? accepted, revision: previous?.revision ?? revision, value: { ...(previous?.value ?? accepted), [field]: next } }))
    setState('idle')
  }
  const save = async (): Promise<void> => {
    if (!draft || disabled || !dirty || conflict || !valid) return
    setState('saving')
    try { await saveQqSpeechDraft(scope, draft.base, draft.value, draft.revision); setDraft(null); setState('saved') }
    catch { setState('failed') }
  }
  if (snapshot.status !== 'ready') return <p role="status">{t('qq.unavailable')}</p>
  return <form className="xmimo-ui-scope xmimo-qq-settings" onSubmit={event => { event.preventDefault(); void save() }}>
    <section>
      <div className="xmimo-qq-heading"><h4>{t('qq.voice')}</h4>
        <Switch label={t('qq.automatic')} checked={value.qqbotEnabled} disabled={disabled} onChange={enabled => edit('qqbotEnabled', enabled)} />
      </div>
      <p className="xmimo-qq-hint">{t('qq.voiceHint')}</p>
      <div className="xmimo-qq-grid">
        {(['qqbotMaxAutoCharacters', 'qqbotMaxDurationSeconds'] as const).map(field => <label className="xmimo-qq-field" key={field}>
          <span>{t(field === 'qqbotMaxAutoCharacters' ? 'qq.characters' : 'qq.duration')}</span>
          <input type="number" min={0} max={field === 'qqbotMaxAutoCharacters' ? 12000 : 6000} step={1} disabled={disabled}
            value={Number.isNaN(value[field]) ? '' : value[field]} onChange={event => edit(field, event.currentTarget.value === '' ? Number.NaN : Number(event.currentTarget.value))} />
        </label>)}
      </div>
      <p className="xmimo-qq-hint">{t('qq.limitsHint')}</p>
      <p className="xmimo-qq-hint">{t('qq.ruleHint')}</p>
    </section>
    <div className="xmimo-tts-card-footer xmimo-qq-footer"><div className="xmimo-tts-card-actions">
      <span role="status">{!snapshot.writable ? t('settings.readOnly') : conflict ? t('whale.conflict') : !valid ? t('qq.error') : state === 'failed' ? t('settings.failed') : state === 'saved' && !dirty ? t('settings.saved') : ''}</span>
      <div className="xmimo-tts-card-action-buttons">
        <Button type="button" variant="outline" size="sm" disabled={!draft || state === 'saving'} onClick={() => { setDraft(null); setState('idle') }}>{t('settings.discard')}</Button>
        <Button type="submit" variant="primary" size="sm" disabled={disabled || !dirty || conflict || !valid}>{t(state === 'saving' ? 'settings.saving' : 'settings.save')}</Button>
      </div>
    </div></div>
  </form>
}
