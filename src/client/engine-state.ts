import type { ExternalSpeechSelection, SpeechEngineState } from '../host-api.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { prepareExternalTtsText, splitTtsSegments, supportsRealtimeTts } from '../shared.js'
import { TTS_ENGINE_EVENTS_ROUTE, TTS_ENGINE_STATE_ROUTE } from '../constants.js'
import { hostRoute } from './host-route.js'

export interface EngineView { status: 'inactive' | 'connecting' | 'ready' | 'unknown'; engine: SpeechEngineState | null }

/** One connection per client plugin; an unknown connection never selects a different engine. */
export class EngineStateStore {
  private view: EngineView = { status: 'inactive', engine: null }
  private readonly listeners = new Set<() => void>()
  getSnapshot = (): EngineView => this.view
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(status: EngineView['status'], engine = this.view.engine): void {
    if (this.view.status === status && JSON.stringify(this.view.engine) === JSON.stringify(engine)) return
    this.view = { status, engine }
    for (const listener of this.listeners) listener()
  }
  start(): () => void {
    this.publish('connecting')
    let disposed = false
    let refreshing: AbortController | null = null
    const source = new EventSource(hostRoute(TTS_ENGINE_EVENTS_ROUTE))
    const refresh = async (): Promise<void> => {
      refreshing?.abort()
      const controller = new AbortController()
      refreshing = controller
      try {
        const response = await fetch(hostRoute(TTS_ENGINE_STATE_ROUTE), { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('engine-state-unavailable')
        const state = await response.json() as SpeechEngineState
        if (!disposed && !controller.signal.aborted) this.accept(state)
      } catch { if (!disposed && !controller.signal.aborted) this.publish('unknown') }
    }
    source.onopen = () => { void refresh() }
    source.onmessage = event => {
      try {
        refreshing?.abort()
        if (!disposed) this.accept(JSON.parse(event.data) as SpeechEngineState)
      } catch { if (!disposed) this.publish('unknown') }
    }
    source.onerror = () => { refreshing?.abort(); if (!disposed) this.publish('unknown') }
    return () => { disposed = true; refreshing?.abort(); source.close(); this.publish('inactive', null) }
  }
  /** Also used by the standalone preview with its in-process Host fixture. */
  accept(state: SpeechEngineState): void {
    if (!state || !Number.isSafeInteger(state.revision) || typeof state.provider !== 'string' || typeof state.ready !== 'boolean'
      || typeof state.name !== 'string' || !Array.isArray(state.formats) || !state.formats.includes('wav')
      || !Number.isSafeInteger(state.maxTextLength) || state.maxTextLength < 1 || typeof state.streaming !== 'boolean') {
      this.publish('unknown'); return
    }
    this.publish('ready', state)
  }
}

export const engineStateStore = new EngineStateStore()
export const externalEngine = (): SpeechEngineState | null => {
  const state = engineStateStore.getSnapshot().engine
  return state?.provider.startsWith('external:') ? state : null
}
export const engineSupportsRealtime = (settings: ResolvedTtsSettings): boolean => externalEngine()?.streaming ?? supportsRealtimeTts(settings)
export const externalText = (text: string): string => prepareExternalTtsText(text, externalEngine()?.models?.find(model => model.id === externalEngine()?.selection?.model)?.audioTags?.map(tag => tag.value))
export const externalFallbackText = (text: string): string => {
  for (const tag of externalEngine()?.models?.find(model => model.id === externalEngine()?.selection?.model)?.audioTags ?? []) text = text.split(tag.value).join(' ')
  return prepareExternalTtsText(text)
}
export const engineText = (text: string, builtin: () => string): string => externalEngine() ? externalText(text) : builtin()
export const engineMaxTextLength = (fallback = 12000): number => externalEngine()?.maxTextLength ?? fallback
export const engineCanRequest = (): boolean => ['inactive', 'ready'].includes(engineStateStore.getSnapshot().status)

/** The built-in sentence grouper allows long sentences; external limits are strict UTF-16 limits. */
export function splitExternalText(text: string, maximum = engineMaxTextLength()): string[] {
  const result: string[] = []
  for (const sentence of splitTtsSegments(text, Math.min(180, maximum), maximum, externalText)) {
    let part = ''
    for (const character of sentence.match(/<[^>]*>|\([^()]*\)|./gu) ?? []) {
      if (character.length > maximum) throw new Error('text-too-long')
      if (part.length + character.length > maximum) { result.push(part); part = '' }
      part += character
    }
    if (part.trim()) result.push(part)
  }
  return result
}

/** Internal browser requests use the selected external engine, never inherited built-in overrides. */
export function speechRequestBody(body: { text: string; format?: 'wav' | 'mp3'; [key: string]: unknown }, selection?: ExternalSpeechSelection): Record<string, unknown> {
  const view = engineStateStore.getSnapshot()
  if (!engineCanRequest()) throw new Error('speech-engine-unavailable')
  const engine = externalEngine()
  if (engine) return { text: body.text, provider: engine.provider, engineRevision: engine.revision,
    ...(selection ? { model: selection.model, voice: selection.voice, speechInstruction: selection.speechInstruction ?? '' } : {}),
    ...(body.format === undefined ? {} : { format: engine.formats.includes(body.format) ? body.format : 'wav' }) }
  return { ...body, ...(view.engine ? { engineRevision: view.engine.revision } : {}) }
}
