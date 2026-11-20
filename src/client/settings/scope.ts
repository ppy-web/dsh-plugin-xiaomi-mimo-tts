import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../../types/settings.js'
import { resolveTtsSettings } from '../../utils/settings.js'
import type { LocaleKey, Translate } from '../localization.js'
import type { SnapshotSource } from '../plugin-activity.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function useSettingsSnapshot<T>(scope: ConfigForm<T>) {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
}

const defaultLocale = { subscribe: () => () => {}, getSnapshot: () => 0 }

/** Host translators read the current language, but their bound identity stays the same. */
export function useSettingsTranslation(translate: Translate, locale: SnapshotSource<number> = defaultLocale): Translate {
  const revision = useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot)
  return useMemo(() => (key: LocaleKey) => translate(key), [translate, revision])
}

export function settingsValueEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || (Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => Object.is(value, right[index])))
}

export function settingsSliceEqual(left: unknown, right: unknown): boolean {
  return settingsValueEqual(left, right) || (isRecord(left) && isRecord(right)
    && Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && settingsValueEqual(left[key], right[key])))
}

/** Host snapshots are namespace-wide. Keep the selected snapshot stable across unrelated writes. */
function settingsSlice<T, S>(scope: ConfigForm<T>, select: (snapshot: ConfigFormSnapshot<T>) => S) {
  let snapshot = scope.getSnapshot()
  let slice = select(snapshot)
  return () => {
    const next = scope.getSnapshot()
    if (next !== snapshot) {
      snapshot = next
      const selected = select(next)
      if (!settingsSliceEqual(slice, selected)) slice = selected
    }
    return slice
  }
}

export function useSettingsSlice<T, S>(scope: ConfigForm<T>, select: (snapshot: ConfigFormSnapshot<T>) => S): S {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useMemo(() => settingsSlice(scope, select), [scope, select])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function observeSettingsSlice<T, S>(scope: ConfigForm<T>, select: (snapshot: ConfigFormSnapshot<T>) => S, update: (slice: S) => void): () => void {
  const getSlice = settingsSlice(scope, select)
  let previous = getSlice()
  const off = scope.subscribe(() => {
    const next = getSlice()
    if (Object.is(previous, next)) return
    previous = next
    update(next)
  })
  try { update(previous) } catch (error) { off(); throw error }
  return off
}

const defaults = resolveTtsSettings(undefined)
const resolvedSnapshots = new WeakMap<TtsSettings, ReturnType<typeof resolveTtsSettings>>()

export function resolvedSettingsSnapshot({ value }: ConfigFormSnapshot<TtsSettings>) {
  if (value === undefined) return defaults
  let settings = resolvedSnapshots.get(value)
  if (settings === undefined) {
    settings = resolveTtsSettings(value)
    resolvedSnapshots.set(value, settings)
  }
  return settings
}
