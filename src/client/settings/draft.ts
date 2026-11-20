import { isRecord, settingsValueEqual } from './scope.js'
import { BUILTIN_SETTING_FIELDS } from './save-settings.js'
import type { DraftChange, DraftChanges, EditableSettingField, SettingField, SettingsValues } from './types.js'

export type DraftSettings = SettingsValues
export type ApiKeys = Record<'xiaomi' | 'doubao' | 'breeze' | 'deepseek', string>

/** Unsaved edits layered over the values the Host already accepts. */
export interface DraftEdits {
  values: Partial<DraftSettings>
  changes: DraftChanges
  keys: ApiKeys
}

export type DraftKind = DraftChange['kind']

/** Secret fields map one-to-one to the provider whose key they hold. */
export const API_KEY_STATE = {
  apiKey: 'xiaomi',
  doubaoApiKey: 'doubao',
  breezeApiKey: 'breeze',
  deepseekApiKey: 'deepseek',
} as const

export type ApiKeyField = keyof typeof API_KEY_STATE

export const API_KEY_BY_PROVIDER = {
  xiaomi: 'apiKey',
  doubao: 'doubaoApiKey',
  breeze: 'breezeApiKey',
  deepseek: 'deepseekApiKey',
} as const satisfies Record<typeof API_KEY_STATE[ApiKeyField], ApiKeyField>

export function isApiKeyField(field: SettingField): field is ApiKeyField {
  return field in API_KEY_STATE
}

export const EMPTY_DRAFT: DraftEdits = { values: {}, changes: {}, keys: { xiaomi: '', doubao: '', breeze: '', deepseek: '' } }

export function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

/** What the Host already accepts for a field, and whether the user layer owns it. */
export interface DraftBaseline {
  accepted: (field: EditableSettingField) => unknown
  overridden: (field: EditableSettingField) => boolean
}

/**
 * Layer one edit over the draft. An entry identical to what the Host accepts is
 * dropped (the form never claims an unsaved change), unless a save is in flight:
 * that save's commit snapshot still has to describe this edit.
 */
export function editDraft(current: DraftEdits, values: Partial<DraftSettings>, kind: DraftKind, baseline: DraftBaseline, saving = false): DraftEdits {
  const nextValues = { ...current.values, ...values }
  const nextChanges = { ...current.changes }
  for (const field of Object.keys(values) as EditableSettingField[]) {
    const unchanged = kind === 'set'
      ? settingsValueEqual(nextValues[field], baseline.accepted(field))
      : !baseline.overridden(field)
    if (!saving && unchanged) {
      delete nextValues[field]
      delete nextChanges[field]
    } else nextChanges[field] = { kind }
  }
  return { ...current, values: nextValues, changes: nextChanges }
}

/** A pending edit stays dirty until the Host accepts its value or the override is gone. */
export function draftFieldDirty(change: DraftChange | undefined, value: unknown, accepted: unknown, overridden: boolean): boolean {
  if (change === undefined) return false
  return change.kind === 'clear' ? overridden : !settingsValueEqual(value, accepted)
}

/**
 * Drop the entries a successful save committed. An edit made while that save was
 * in flight replaced its change object and therefore survives, and built-in
 * fields stay untouched while an external engine owns the configuration.
 */
export function pruneDraftEdits(current: DraftEdits, committed: DraftChanges, external: boolean): DraftEdits {
  const values = { ...current.values }
  const keys = { ...current.keys }
  const changes = { ...current.changes }
  for (const field of Object.keys(committed) as SettingField[]) {
    if (current.changes[field] !== committed[field] || (external && BUILTIN_SETTING_FIELDS.has(field))) continue
    delete changes[field]
    if (isApiKeyField(field)) keys[API_KEY_STATE[field]] = ''
    else delete values[field]
  }
  return { values, changes, keys }
}
