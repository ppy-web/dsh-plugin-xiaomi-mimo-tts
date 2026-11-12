import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveExternalReadingModel, saveExternalReadingVoice } = await loadClientModule('src/client/settings/external-selection.ts')
const { engineStateStore } = await loadClientModule('src/client/engine-state.ts')
const { TTS_DESKTOP_WRITE_HEADER, TTS_ENGINE_SELECTION_ROUTE } = await loadClientModule('src/constants.ts')

const builtin = { provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 12000, streaming: false }
const external = {
  ...builtin, provider: 'external:test', name: 'External', revision: 40, configurable: true,
  selection: { model: 'first', voice: 'shared', speechInstruction: 'gentle' },
  models: [
    { id: 'first', name: 'First', voices: [{ id: 'shared', name: 'Shared' }, { id: 'other', name: 'Other' }] },
    { id: 'second', name: 'Second', voices: [{ id: 'shared', name: 'Shared' }] },
    { id: 'third', name: 'Third', voices: [{ id: 'new', name: 'New' }] },
    { id: 'empty', name: 'Empty', voices: [] },
  ],
}

test('external reading model selections save immediately with a compatible voice', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  engineStateStore.accept(external)
  globalThis.fetch = async (path, options) => {
    assert.equal(path, TTS_ENGINE_SELECTION_ROUTE)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers[TTS_DESKTOP_WRITE_HEADER], '1')
    const body = JSON.parse(options.body)
    requests.push(body)
    const current = engineStateStore.getSnapshot().engine
    assert.equal(body.engineRevision, current.revision)
    return Response.json({ ...current, revision: current.revision + 1, selection: body.selection })
  }
  try {
    await saveExternalReadingModel(external, 'first')
    assert.equal(requests.length, 0)
    assert.equal(engineStateStore.getSnapshot().engine.selection.speechInstruction, 'gentle')

    await saveExternalReadingModel(external, 'second')
    assert.deepEqual(requests[0], { provider: external.provider, engineRevision: 40,
      selection: { model: 'second', voice: 'shared', speechInstruction: '' } })
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, requests[0].selection)

    await saveExternalReadingModel(engineStateStore.getSnapshot().engine, 'third')
    assert.deepEqual(requests[1].selection, { model: 'third', voice: 'new', speechInstruction: '' })
    assert.equal(requests[1].engineRevision, 41)
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, requests[1].selection)
  } finally {
    globalThis.fetch = originalFetch
    engineStateStore.accept(builtin)
  }
})

test('external reading voice changes preserve the instruction and retain the saved selection on failure', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  let rejected = true
  engineStateStore.accept(external)
  globalThis.fetch = async (_path, options) => {
    const body = JSON.parse(options.body)
    requests.push(body)
    if (rejected) return Response.json({ error: 'speech-engine-changed' }, { status: 409 })
    return Response.json({ ...external, revision: 41, selection: body.selection })
  }
  try {
    await assert.rejects(saveExternalReadingVoice(external, 'other'), { message: 'speech-engine-changed' })
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, external.selection)
    assert.deepEqual(requests[0], { provider: external.provider, engineRevision: 40,
      selection: { model: 'first', voice: 'other', speechInstruction: 'gentle' } })

    rejected = false
    await saveExternalReadingVoice(engineStateStore.getSnapshot().engine, 'other')
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, requests[1].selection)
  } finally {
    globalThis.fetch = originalFetch
    engineStateStore.accept(builtin)
  }
})

test('read-only and invalid external selections do not write configuration', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => assert.fail('must not write configuration')
  try {
    await saveExternalReadingModel({ ...external, configurable: false }, 'second')
    await saveExternalReadingModel(external, 'empty')
    await saveExternalReadingModel(external, 'missing')
    await saveExternalReadingVoice({ ...external, configurable: false }, 'other')
    await saveExternalReadingVoice(external, 'missing')
    await saveExternalReadingVoice(external, 'shared')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a late external save response cannot overwrite a newer engine selection', async () => {
  const originalFetch = globalThis.fetch
  let respond
  engineStateStore.accept(external)
  globalThis.fetch = () => new Promise(resolve => { respond = resolve })
  try {
    const saving = saveExternalReadingVoice(external, 'other')
    const newer = { ...external, revision: 42, selection: { model: 'third', voice: 'new' } }
    engineStateStore.accept(newer)
    respond(Response.json({ ...external, revision: 41, selection: { ...external.selection, voice: 'other' } }))
    await saving
    assert.deepEqual(engineStateStore.getSnapshot().engine, newer)
  } finally {
    globalThis.fetch = originalFetch
    engineStateStore.accept(builtin)
  }
})
