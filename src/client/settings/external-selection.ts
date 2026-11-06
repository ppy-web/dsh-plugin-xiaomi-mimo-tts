import { useState } from 'react'
import type { ExternalSpeechSelection, SpeechEngineState } from '../../host-api.js'
import { TTS_ENGINE_SELECTION_ROUTE } from '../../constants.js'
import { engineStateStore } from '../engine-state.js'
import { hostRoute } from '../host-route.js'

export async function saveExternalSelection(engine: SpeechEngineState, selection: ExternalSpeechSelection, revision = engine.revision): Promise<void> {
  const response = await fetch(hostRoute(TTS_ENGINE_SELECTION_ROUTE), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: engine.provider, engineRevision: revision, selection }),
  })
  const body = await response.json() as SpeechEngineState & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'external-configuration-failed')
  if ((engineStateStore.getSnapshot().engine?.revision ?? -1) <= body.revision) engineStateStore.accept(body)
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
    await saveExternalSelection(engine, current.value, current.revision)
    setDraft(null)
  } }
}
