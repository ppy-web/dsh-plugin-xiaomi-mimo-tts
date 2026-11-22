import { useEffect, useSyncExternalStore } from 'react'
import { TTS_DESKTOP_WRITE_HEADER, TTS_PORTRAITS_ROUTE, TTS_PORTRAIT_IMAGE_ROUTE } from '../../constants.js'
import { PORTRAIT_SLOTS } from '../../types/portrait.js'
import type { PortraitManifest, PortraitSlot, PortraitSlotState } from '../../types/portrait.js'
import { hostRoute } from '../host-route.js'

const EMPTY: PortraitManifest = { slots: { voice: null, autoplay: null, sound: null, provider: null } }

let manifest: PortraitManifest = EMPTY
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void { for (const listener of listeners) listener() }

function normalizeSlot(value: unknown): PortraitSlotState | null {
  if (typeof value === 'string' && value.length > 0) return { version: value, scale: 1 }
  if (value === null || typeof value !== 'object') return null
  const record = value as { version?: unknown; scale?: unknown }
  if (typeof record.version !== 'string' || record.version.length === 0) return null
  return { version: record.version, scale: typeof record.scale === 'number' ? record.scale : 1 }
}

function normalize(value: unknown): PortraitManifest {
  const slots = { ...EMPTY.slots }
  const source = (value as { slots?: Record<string, unknown> } | null)?.slots
  for (const slot of PORTRAIT_SLOTS) slots[slot] = normalizeSlot(source?.[slot])
  return { slots }
}

function apply(next: PortraitManifest): void {
  manifest = next
  emit()
}

/** Fetch the host manifest once per mount; later uploads update the same snapshot in place. */
export function refreshPortraits(): Promise<void> {
  if (pending !== null) return pending
  pending = (async () => {
    try {
      const response = await fetch(hostRoute(TTS_PORTRAITS_ROUTE), { headers: { accept: 'application/json' } })
      if (response.ok) apply(normalize(await response.json()))
    } catch {
      // Keep the last good manifest; default art still renders.
    } finally {
      pending = null
    }
  })()
  return pending
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): PortraitManifest { return manifest }

export function usePortraitManifest(): PortraitManifest {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => { void refreshPortraits() }, [])
  return snapshot
}

function imageUrl(slot: PortraitSlot, version: string): string {
  return `${hostRoute(TTS_PORTRAIT_IMAGE_ROUTE)}?slot=${slot}&v=${encodeURIComponent(version)}`
}

export interface PortraitView { url: string; scale: number }

export function portraitView(manifestValue: PortraitManifest, slot: PortraitSlot): PortraitView | null {
  const state = manifestValue.slots[slot]
  return state === null ? null : { url: imageUrl(slot, state.version), scale: state.scale }
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'))
    reader.readAsDataURL(file)
  })
}

async function request(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(hostRoute(TTS_PORTRAITS_ROUTE), {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`portrait-request-failed-${response.status}`)
  apply(normalize(await response.json()))
}

export async function uploadPortrait(slot: PortraitSlot, file: Blob, scale?: number): Promise<void> {
  const image = await readDataUrl(file)
  await request({ slot, image, ...(scale === undefined ? {} : { scale }) })
}

export function previewPortraitScale(slot: PortraitSlot, scale: number): void {
  const current = manifest.slots[slot]
  if (current === null || current.scale === scale) return
  apply({ slots: { ...manifest.slots, [slot]: { ...current, scale } } })
}

export async function setPortraitScale(slot: PortraitSlot, scale: number): Promise<void> {
  previewPortraitScale(slot, scale)
  await request({ slot, scale })
}

export async function resetPortrait(slot: PortraitSlot): Promise<void> {
  const response = await fetch(`${hostRoute(TTS_PORTRAITS_ROUTE)}?slot=${slot}`, {
    method: 'DELETE',
    headers: { [TTS_DESKTOP_WRITE_HEADER]: '1' },
  })
  if (!response.ok) throw new Error(`portrait-reset-failed-${response.status}`)
  apply(normalize(await response.json()))
}
