import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { Translate } from '../localization.js'
import { useSettingsSnapshot } from './scope.js'
import { saveQqSpeechDraft, validQqSpeechDraft, type QqSpeechDraft } from './qqbot-speech-draft.js'
import { loadQqMemory, updateQqMemory, type QqMemoryPeer } from './qqbot-memory.js'
import type { WhaleSettings } from '../../types/whale.js'
import { WhalePersonaSettings } from './whale-settings.js'

interface Props extends PluginConfigViewProps {
  scope: ConfigForm<TtsSettings>
  personaScope: ConfigForm<WhaleSettings>
  t: Translate
  changes?: SnapshotSource<boolean>
}
export function QqbotSpeechSettings(props: Props): ReactElement {
  if (props.view === 'summary') return <>{props.t('qq.description')}</>
  return <div>
    <WhalePersonaSettings view={props.view} scope={props.personaScope} t={props.t} changes={props.changes} channel="qq" />
    <QqbotSpeechPage {...props} />
  </div>
}
function QqbotSpeechPage({ scope, t, changes = IDLE_PLUGIN_CHANGES }: Props): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const [draft, setDraft] = useState<{ base: QqSpeechDraft; value: QqSpeechDraft; revision: number } | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [memory, setMemory] = useState<{ status: 'loading' | 'ready' | 'unavailable'; peers: QqMemoryPeer[] }>({ status: 'loading', peers: [] })
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, string>>({})
  const [memoryState, setMemoryState] = useState<string>('')
  const [memoryBusy, setMemoryBusy] = useState(false)
  const refreshMemory = (): void => { void loadQqMemory().then(peers => setMemory({ status: 'ready', peers })).catch(() => setMemory({ status: 'unavailable', peers: [] })) }
  const runMemoryAction = async (action: () => Promise<unknown>): Promise<void> => {
    if (memoryBusy) return
    setMemoryBusy(true)
    setMemoryState('')
    try { await action(); refreshMemory(); setMemoryState('qq.memorySaved') }
    catch { setMemoryState('qq.memoryError') }
    finally { setMemoryBusy(false) }
  }
  useEffect(() => { refreshMemory() }, [])
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
  return <form className="xmimo-ui-scope xmimo-qq-settings" aria-label={t('qq.voice')} onSubmit={event => { event.preventDefault(); void save() }}>
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
    <section aria-label={t('qq.memory')}>
      <div className="xmimo-qq-heading"><h4>{t('qq.memory')}</h4></div>
      <p className="xmimo-qq-hint">{t('qq.memoryHint')}</p>
      {memory.status === 'loading' ? <p role="status">{t('qq.memoryLoading')}</p> : null}
      {memory.status === 'unavailable' ? <p role="status">{t('qq.memoryUnavailable')}</p> : null}
      {memory.status === 'ready' && memory.peers.length === 0 ? <p role="status">{t('qq.memoryEmpty')}</p> : null}
      <div className="xmimo-qq-memory-list">
        {memory.peers.map(peer => <div className="xmimo-qq-memory-peer" key={peer.key}>
          <div className="xmimo-qq-heading"><strong>{peer.scope === 'group' ? `${t('qq.group')} ${peer.peerId}` : `${t('qq.private')} ${peer.peerId}`}</strong>
            <div className="xmimo-qq-memory-actions"><Button type="button" variant="outline" size="sm" disabled={memoryBusy} onClick={() => { void runMemoryAction(() => updateQqMemory({ key: peer.key, action: peer.memoryEnabled ? 'pause' : 'resume' })) }}>{peer.memoryEnabled ? t('qq.pauseMemory') : t('qq.resumeMemory')}</Button>
            <Button type="button" variant="outline" size="sm" disabled={memoryBusy} onClick={() => { void runMemoryAction(() => updateQqMemory({ key: peer.key, action: 'clear' })) }}>{t('qq.clearMemory')}</Button></div>
          </div>
          {[...peer.entries.map(item => ({ id: item.id, kind: item.kind, text: item.text })), ...peer.topics.map(item => ({ id: item.id, kind: 'topic' as const, text: item.title }))].map(item => <div className="xmimo-qq-memory-row" key={item.id}>
            <span className="xmimo-qq-memory-kind">{t(`qq.memoryKind.${item.kind}` as never)}</span>
            <input disabled={memoryBusy} value={memoryDrafts[item.id] ?? item.text} maxLength={item.kind === 'topic' ? 80 : 300} onChange={event => setMemoryDrafts(current => ({ ...current, [item.id]: event.currentTarget.value }))} />
            <Button type="button" variant="outline" size="sm" disabled={memoryBusy} onClick={() => { void runMemoryAction(async () => { await updateQqMemory({ key: peer.key, action: 'save', id: item.id, kind: item.kind, text: memoryDrafts[item.id] ?? item.text }); setMemoryDrafts(current => { const next = { ...current }; delete next[item.id]; return next }) }) }}>{t('qq.editMemory')}</Button>
            <Button type="button" variant="outline" size="sm" disabled={memoryBusy} onClick={() => { void runMemoryAction(async () => { await updateQqMemory({ key: peer.key, action: 'delete', id: item.id }); setMemoryDrafts(current => { const next = { ...current }; delete next[item.id]; return next }) }) }}>{t('qq.deleteMemory')}</Button>
          </div>)}
        </div>)}
      </div>
      {memoryState ? <span role="status">{t(memoryState as never)}</span> : null}
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
