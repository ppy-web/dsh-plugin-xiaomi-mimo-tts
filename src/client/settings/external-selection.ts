import { useState } from 'react'
import type { ExternalSpeechConfigurationChange, ExternalSpeechSelection, SpeechEngineState } from '../../host-api.js'
import { TTS_DESKTOP_WRITE_HEADER, TTS_ENGINE_SELECTION_ROUTE } from '../../constants.js'
import { engineStateStore } from '../engine-state.js'
import { hostRoute } from '../host-route.js'

async function configureExternal(engine: SpeechEngineState, change: ExternalSpeechConfigurationChange, revision = engine.revision): Promise<SpeechEngineState> {
  const response = await fetch(hostRoute(TTS_ENGINE_SELECTION_ROUTE), {
    method: 'POST', headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
    body: JSON.stringify({ provider: engine.provider, engineRevision: revision, ...change }),
  })
  const body = await response.json() as SpeechEngineState & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'external-configuration-failed')
  if ((engineStateStore.getSnapshot().engine?.revision ?? -1) <= body.revision) engineStateStore.accept(body)
  return body
}

export const saveExternalSelection = (engine: SpeechEngineState, selection: ExternalSpeechSelection, revision = engine.revision) => configureExternal(engine, { selection }, revision)
export const switchExternalConfiguration = async (engine: SpeechEngineState, configurationId: string): Promise<void> => { await configureExternal(engine, { configurationId }) }

/** The Voice reading page saves each selection immediately. */
export function externalReadingModel(engine: SpeechEngineState, modelId: string): ExternalSpeechSelection | undefined {
  const model = engine.models?.find(item => item.id === modelId)
  const previous = engine.selection
  if (!engine.configurable || !model?.voices.length || modelId === previous?.model) return
  const voice = model.voices.find(item => item.id === previous?.voice)?.id ?? model.voices[0]!.id
  return { model: modelId, voice, speechInstruction: '' }
}

export function externalReadingVoice(engine: SpeechEngineState, voiceId: string): ExternalSpeechSelection | undefined {
  const previous = engine.selection
  const model = engine.models?.find(item => item.id === previous?.model)
  if (!engine.configurable || !previous || voiceId === previous.voice || !model?.voices.some(item => item.id === voiceId)) return
  return { ...previous, voice: voiceId }
}

export async function saveExternalReadingModel(engine: SpeechEngineState, modelId: string): Promise<void> {
  const selection = externalReadingModel(engine, modelId)
  if (selection) await saveExternalSelection(engine, selection)
}

export async function saveExternalReadingVoice(engine: SpeechEngineState, voiceId: string): Promise<void> {
  const selection = externalReadingVoice(engine, voiceId)
  if (selection) await saveExternalSelection(engine, selection)
}

export function nextExternalConfiguration(engine: SpeechEngineState) {
  const configurations = engine.configurations ?? []
  if (!engine.configurationSwitchable || configurations.length < 2) return
  return configurations[(configurations.findIndex(item => item.id === engine.configurationId) + 1) % configurations.length]
}

/** Drafts belong to a profile and revision, separate from every built-in configuration field. */
export function useExternalSelection(engine: SpeechEngineState | null) {
  const identity = engine ? `${engine.provider}/${engine.configurationId ?? ''}` : ''
  const [draft, setDraft] = useState<{ identity: string; revision: number; value: ExternalSpeechSelection } | null>(null)
  const current = draft?.identity === identity && (draft.revision === engine?.revision || JSON.stringify(draft.value) !== JSON.stringify(engine?.selection)) ? draft : null
  const value = current?.value ?? engine?.selection
  const dirty = !!current && JSON.stringify(current.value) !== JSON.stringify(engine?.selection)
  const change = (next: ExternalSpeechSelection): void => {
    if (!engine?.configurable) return
    setDraft({ identity, revision: current?.revision ?? engine.revision, value: next })
  }
  return { value, dirty, change, discard: () => setDraft(null), save: async () => {
    if (!engine || !current || !dirty) return
    const accepted = await saveExternalSelection(engine, current.value, current.revision)
    setDraft(next => {
      if (next === current) return null
      return next?.identity === current.identity && next.revision === current.revision
        ? { ...next, revision: accepted.revision } : next
    })
  } }
}
