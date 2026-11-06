import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { resolveTtsSettings } from '../lib/shared.js'
import { createTestProvider } from './helpers/external-provider.mjs'
import { loadClientModule } from './helpers/client-modules.mjs'

const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
const { registerEngineRoutes } = await loadClientModule('src/host/engine-routes.ts')
const { engineStateStore, externalText, externalFallbackText, splitExternalText } = await loadClientModule('src/client/engine-state.ts')
const { nextExternalConfiguration, switchExternalConfiguration } = await loadClientModule('src/client/settings/external-selection.ts')

/** An in-memory provider exercising the public contract without a real adapter dependency. */
function configurableProvider() {
  const listeners = new Set()
  const provider = createTestProvider()
  let selection = { model: 'test-model', voice: 'first' }
  let configurationId = 'primary'
  const adapter = {
    ...provider,
    id: 'external:catalog-test',
    getSnapshot: () => ({ ...provider.getSnapshot(), selection, configurationId,
      configurations: [{ id: 'primary', name: 'Primary', secret: 'private-test-key' }, { id: 'secondary', name: 'Secondary' }],
      managementBundle: 'test-provider-settings', managementPath: '/plugins/test-provider',
      models: [{ id: 'test-model', name: 'Test model', voices: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }],
        audioTags: [{ value: '<break time=500>', name: 'Pause' }] }],
    }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async configure(next, { signal }) {
      signal.throwIfAborted()
      selection = structuredClone(next)
      for (const listener of listeners) listener()
    },
    async selectConfiguration(next, { signal }) {
      signal.throwIfAborted()
      configurationId = next
      selection = { ...selection, voice: next === 'secondary' ? 'second' : 'first' }
      for (const listener of listeners) listener()
    },
  }
  return adapter
}

test('external selection writes cancel old synthesis, retain built-in settings and validate per-request options', async () => {
  const settings = resolveTtsSettings({ provider: 'breeze', breezeEnabled: true })
  const service = new HostSpeechService(() => settings)
  const adapter = configurableProvider()
  const synthesize = adapter.synthesize
  let started, block = true
  const pendingStart = new Promise(resolve => { started = resolve })
  adapter.synthesize = request => {
    if (!block) return synthesize(request)
    started()
    return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }))
  }
  const off = service.registerProvider(adapter)
  try {
    const before = service.engineState()
    const selected = { ...before.selection, voice: 'second' }
    const cancelled = assert.rejects(service.synthesize({ text: 'pending', format: 'wav' }), { code: 'speech-engine-changed' })
    await pendingStart
    const after = await service.configureProvider({ provider: adapter.id, engineRevision: before.revision, selection: selected })
    await cancelled
    block = false
    assert.equal(adapter.getSnapshot().selection.voice, 'second')
    assert.equal(after.selection.voice, 'second')
    assert.equal(after.managementBundle, 'test-provider-settings')
    assert.equal(settings.provider, 'breeze')
    await assert.rejects(service.configureProvider({ provider: adapter.id, engineRevision: before.revision, selection: selected }), { code: 'speech-engine-changed' })
    const audio = await service.synthesize({ text: 'Hi <break time=500> there.', format: 'wav', voice: 'first' })
    assert.ok(audio.text.includes('<break time=500>'))
    assert.equal(audio.format, 'wav')
    await assert.rejects(service.synthesize({ text: 'Hi', model: 'missing' }), { code: 'external-selection-invalid' })
    await assert.rejects(service.synthesize({ text: 'Hi', speechInstruction: 'unsupported' }), { code: 'external-option-unsupported' })
    assert.equal(adapter.getSnapshot().selection.voice, 'second')
    const caps = service.capabilities().providers.find(item => item.id === adapter.id)
    assert.equal(caps.selectedVoice, 'second')
    assert.equal(caps.models[0].audioTags, true)
  } finally { off(); await service.dispose() }
})

test('provider card cycles adapter configurations, cancels old audio and preserves built-in settings', async () => {
  const settings = resolveTtsSettings({ provider: 'doubao' })
  const service = new HostSpeechService(() => settings)
  const adapter = configurableProvider()
  let started
  const ready = new Promise(resolve => { started = resolve })
  adapter.synthesize = () => { started(); return new Promise(() => {}) }
  const off = service.registerProvider(adapter)
  try {
    const before = service.engineState()
    assert.equal(JSON.stringify(before).includes('private-test-key'), false)
    const next = nextExternalConfiguration(before)
    assert.equal(next.id, 'secondary')
    const pending = assert.rejects(service.synthesize({ text: 'pending' }), { code: 'speech-engine-changed' })
    await ready
    const after = await service.configureProvider({ provider: adapter.id, engineRevision: before.revision, configurationId: next.id })
    await pending
    assert.equal(after.configurationId, 'secondary')
    assert.equal(after.selection.voice, 'second')
    assert.equal(nextExternalConfiguration(after).id, 'primary')
    assert.equal(settings.provider, 'doubao')
    await assert.rejects(service.configureProvider({ provider: adapter.id, engineRevision: before.revision, configurationId: 'primary' }), { code: 'speech-engine-changed' })
    await assert.rejects(service.configureProvider({ provider: adapter.id, engineRevision: after.revision, configurationId: 'missing' }), { code: 'external-selection-invalid' })
    assert.equal(service.engineState().configurationId, 'secondary')
    assert.equal(nextExternalConfiguration({ ...after, configurations: [next] }), undefined)
    assert.equal(nextExternalConfiguration({ ...after, configurationSwitchable: false }), undefined)
  } finally { off(); await service.dispose() }
})

test('browser external text preserves declared tags through splitting and removes them for local fallback', () => {
  engineStateStore.accept({ provider: 'external:adapter', revision: 1, name: 'Test provider', ready: true, formats: ['wav'], streaming: true, maxTextLength: 100,
    selection: { model: 'm', voice: 'v' }, models: [{ id: 'm', name: 'M', voices: [{ id: 'v', name: 'V' }], audioTags: [{ value: '<break time=500>', name: 'Pause' }] }] })
  try {
    const text = '**Hello** <break time=500> world.'
    assert.ok(externalText(text).includes('<break time=500>'))
    assert.ok(splitExternalText(text, 24).join('').includes('<break time=500>'))
    assert.equal(externalFallbackText(text).includes('break'), false)
    assert.ok(splitExternalText('𠮷𠮷𠮷', 3).every(chunk => chunk.length <= 3))
  } finally { engineStateStore.accept({ provider: 'xiaomi', revision: 2, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 1000, streaming: true }) }
})

test('external selection routes reject cross-origin and stale writes, then unregister restores built-in selection', async () => {
  const routes = new Map(), cleanup = []
  const service = new HostSpeechService(() => resolveTtsSettings({}))
  const adapter = configurableProvider()
  const off = service.registerProvider(adapter)
  const ctx = { speechSynthesis: service, effect(fn) { cleanup.push(fn()) },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }
  registerEngineRoutes(ctx)
  const server = createServer((req, res) => {
    const route = routes.get(new URL(req.url, 'http://localhost').pathname)
    if (route) void route.handler(req, res)
    else { res.statusCode = 404; res.end() }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (body, headers = { origin }) => fetch(origin + '/plugins/xiaomi-mimo-tts/engine-selection', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  try {
    const before = service.engineState()
    const change = { provider: before.provider, engineRevision: before.revision, selection: { ...before.selection, voice: 'second' } }
    for (const headers of [{}, { origin: 'https://foreign.test' }, { origin, 'sec-fetch-site': 'cross-site' }]) assert.equal((await post(change, headers)).status, 403)
    const selection = await post(change)
    assert.equal(selection.status, 200)
    assert.equal((await selection.json()).selection.voice, 'second')
    assert.equal((await post(change)).status, 409)
    const current = service.engineState()
    const switchBody = { provider: current.provider, engineRevision: current.revision, configurationId: 'secondary' }
    for (const headers of [{}, { origin: 'https://foreign.test' }, { origin, 'sec-fetch-site': 'cross-site' }]) assert.equal((await post(switchBody, headers)).status, 403)
    assert.equal((await post({ ...switchBody, selection: current.selection })).status, 400)
    assert.equal((await post({ ...switchBody, configurationId: 'missing' })).status, 400)
    engineStateStore.accept(current)
    try {
      const nativeFetch = globalThis.fetch
      globalThis.fetch = (path, init) => nativeFetch(origin + path, { ...init, headers: { ...init.headers, origin } })
      try { await switchExternalConfiguration(current, 'secondary') } finally { globalThis.fetch = nativeFetch }
      assert.equal(engineStateStore.getSnapshot().engine.configurationId, 'secondary')
      assert.equal(service.engineState().configurationId, 'secondary')
      assert.equal((await post(switchBody)).status, 409)
    } finally { engineStateStore.accept({ provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 1000, streaming: true }) }
    off()
    assert.equal(service.currentProvider(), 'xiaomi')
  } finally {
    for (const dispose of cleanup.reverse()) await dispose?.()
    off(); await service.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
})
