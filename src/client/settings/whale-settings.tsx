import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_WHALE_SETTINGS } from '../../types/whale.js'
import type { WhaleSettings, WhalePersona } from '../../types/whale.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import type { LocaleKey, Translate } from '../localization.js'
import { useSettingsSnapshot } from './scope.js'
import { saveWhaleDraft, validateWhaleDraft } from './whale-draft.js'

export interface WhaleSettingsProps extends PluginConfigViewProps {
  scope: ConfigForm<WhaleSettings>
  t: Translate
  changes?: SnapshotSource<boolean> | undefined
}
interface Draft {
  value: WhaleSettings
  base: WhaleSettings
  revision: number
}
const PERSONA_FIELDS: ReadonlyArray<{ field: keyof WhalePersona; label: LocaleKey; limit: number; multiline?: boolean }> = [
  { field: 'name', label: 'whale.name', limit: 60 },
  { field: 'selfReference', label: 'whale.selfReference', limit: 40 },
  { field: 'userAddress', label: 'whale.userAddress', limit: 40 },
  { field: 'relationship', label: 'whale.relationship', limit: 1000 },
  { field: 'personality', label: 'whale.personality', limit: 1200, multiline: true },
  { field: 'replyStyle', label: 'whale.replyStyle', limit: 1200, multiline: true },
  { field: 'likes', label: 'whale.likes', limit: 1000, multiline: true },
  { field: 'boundaries', label: 'whale.boundaries', limit: 1200, multiline: true },
]
const ERROR_KEYS: Record<NonNullable<ReturnType<typeof validateWhaleDraft>>, LocaleKey> = {
  persona: 'whale.errorPersona',
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return <label className="xmimo-qq-field"><span>{label}</span>{children}</label>
}

export function WhalePersonaSettings(props: WhaleSettingsProps): ReactElement {
  if (props.view === 'summary') return <>{props.t('whale.description')}</>
  return <WhaleSettingsPage scope={props.scope} t={props.t} changes={props.changes} />
}

function WhaleSettingsPage({ scope, t, changes = IDLE_PLUGIN_CHANGES }: Omit<WhaleSettingsProps, 'view'>): ReactElement {
  const snapshot = useSettingsSnapshot(scope)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const value = draft?.value ?? snapshot.value ?? DEFAULT_WHALE_SETTINGS
  const ready = snapshot.status === 'ready'
  const disabled = !ready || !snapshot.writable || changing || state === 'saving'
  const dirty = draft !== null && JSON.stringify(draft.base) !== JSON.stringify(draft.value)
  const conflict = draft !== null && draft.revision !== snapshot.revision
  const invalid = dirty ? validateWhaleDraft(value) : null
  const edit = (change: (value: WhaleSettings) => WhaleSettings): void => {
    if (disabled || snapshot.revision === undefined || !snapshot.value) return
    const revision = snapshot.revision, accepted = snapshot.value
    setDraft(previous => previous ? { ...previous, value: change(previous.value) } : { base: accepted, value: change(accepted), revision })
    setState('idle')
  }
  const save = async (): Promise<void> => {
    if (!draft || disabled || !dirty || invalid || conflict) return
    setState('saving')
    try {
      await saveWhaleDraft(scope, draft.base, draft.value, draft.revision)
      setDraft(null)
      setState('saved')
    } catch { setState('failed') }
  }

  if (!ready) return <p role="status">{t(snapshot.status === 'loading' ? 'whale.loading' : 'whale.unavailable')}</p>
  return <form className="xmimo-ui-scope xmimo-qq-settings" onSubmit={event => { event.preventDefault(); void save() }}>
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
    <section aria-label={t('whale.persona')}>
      <h4>{t('whale.persona')}</h4>
      <p className="xmimo-qq-hint">{t('whale.personaHint')}</p>
      <div className="xmimo-qq-grid">
        {PERSONA_FIELDS.map(({ field, label, limit, multiline }) => <Field key={field} label={t(label)}>
          {multiline ? <textarea rows={3} maxLength={limit} value={value.persona[field]} disabled={disabled}
            onChange={event => { const next = event.currentTarget.value; edit(current => ({ ...current, persona: { ...current.persona, [field]: next } })) }} />
            : <input maxLength={limit} value={value.persona[field]} disabled={disabled} required={field === 'name' || field === 'selfReference'}
              onChange={event => { const next = event.currentTarget.value; edit(current => ({ ...current, persona: { ...current.persona, [field]: next } })) }} />}
        </Field>)}
      </div>
    </section>
    <section aria-label={t('whale.memory')}>
      <div className="xmimo-qq-heading"><h4>{t('whale.memory')}</h4>
        <Switch label={t('whale.memoryEnabled')} checked={value.memory.enabled} disabled={disabled}
          onChange={enabled => edit(current => ({ ...current, memory: { enabled } }))} />
      </div>
      <p className="xmimo-qq-hint">{t('whale.memoryHint')}</p>
    </section>
    <div className="xmimo-tts-card-footer xmimo-qq-footer">
      <div className="xmimo-tts-card-actions">
        <span role="status">{!snapshot.writable ? t('settings.readOnly') : conflict ? t('whale.conflict') : invalid ? t(ERROR_KEYS[invalid])
          : state === 'failed' ? t('settings.failed') : state === 'saved' && !dirty ? t('settings.saved') : ''}</span>
        <div className="xmimo-tts-card-action-buttons">
          <Button type="button" variant="outline" size="sm" disabled={!draft || state === 'saving'} onClick={() => { setDraft(null); setState('idle') }}>{t('settings.discard')}</Button>
          <Button type="submit" variant="primary" size="sm" className="xmimo-tts-save" disabled={disabled || !dirty || conflict || invalid !== null}>{t(state === 'saving' ? 'settings.saving' : 'settings.save')}</Button>
        </div>
      </div>
    </div>
  </form>
}
