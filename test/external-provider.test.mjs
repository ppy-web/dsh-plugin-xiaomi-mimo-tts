import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { isSilk } from 'silk-wasm'
import { Context } from '@deepseek-ai/cordis'
import { TtsProviderError as PublicError } from '../lib/host-api.js'
import { resolveTtsSettings } from '../lib/shared.js'
import { createTestProvider, createTestWav } from './helpers/external-provider.mjs'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
const { registerSynthesisRoutes } = await loadClientModule('src/host/synthesis-routes.ts')
const { registerEngineRoutes } = await loadClientModule('src/host/engine-routes.ts')
const { registerOpenApiRoutes } = await loadClientModule('src/host/open-api-routes.ts')
const { engineStateStore, speechRequestBody, EngineStateStore } = await loadClientModule('src/client/engine-state.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { validateExternalAudio } = await loadClientModule('src/host/external-providers.ts')
const builtin = { provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav', 'mp3'], maxTextLength: 12000, streaming: true }
const externalState = { ...builtin, provider: 'external:test-provider', name: 'Test provider', formats: ['wav'], streaming: false }

function fixture(overrides = {}, config = {}) {
  const settings = resolveTtsSettings({ requestTimeoutMs: 1000, ...config })
  const service = new HostSpeechService(() => settings)
  const base = createTestProvider()
  const listeners = new Set()
  const state = { ...base.getSnapshot(), secret: 'must-not-be-exposed' }
  const calls = []
  const provider = { ...base, getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    synthesize: request => { calls.push(request); return base.synthesize(request) }, ...overrides }
  const change = patch => { Object.assign(state, patch); for (const listener of listeners) listener() }
  return { service, provider, state, change, calls, settings }
}

test('registration takes over without changing saved settings and unregistering is idempotent', async () => {
  const f = fixture()
  const off = f.service.registerProvider(f.provider)
  try {
    assert.equal(f.service.currentProvider(), f.provider.id)
    assert.equal(f.settings.provider, 'xiaomi')
    assert.equal(f.service.supportsAudioTags(), false)
    assert.deepEqual(f.service.capabilities().formats, ['wav', 'silk'])
    assert.equal(JSON.stringify(f.service.capabilities()).includes('must-not-be-exposed'), false)
    const audio = await f.service.synthesize({ text: '**你好**。' })
    assert.equal(audio.provider, f.provider.id)
    assert.equal(audio.format, 'wav')
    assert.equal(audio.durationMs, 500)
    assert.equal(f.calls[0].text.includes('**'), false)
    await assert.rejects(f.service.synthesize({ text: 'explicit builtin', provider: 'xiaomi' }), { code: 'api-key-not-configured' })
    const silk = await f.service.synthesize({ text: '你好', format: 'silk' })
    assert.ok(isSilk(silk.data))
    const artifact = await f.service.exportAudio({ text: '导出', format: 'wav' })
    try { assert.equal((await readFile(artifact.path)).toString('ascii', 8, 12), 'WAVE') } finally { await artifact.remove() }
    off(); off()
    assert.equal(f.service.currentProvider(), 'xiaomi')
    assert.throws(() => f.service.resolveProvider({ provider: f.provider.id }), { code: 'external-provider-unavailable' })
  } finally { off(); await f.service.dispose() }
})

test('registration conflict and invalid adapters leave the existing provider intact', async () => {
  const f = fixture()
  try {
    assert.throws(() => f.service.registerProvider({ ...f.provider, apiVersion: 2 }), { code: 'external-provider-invalid' })
    assert.throws(() => f.service.registerProvider({ ...f.provider, getSnapshot: () => ({ ...f.state, formats: ['mp3'] }) }), { code: 'external-provider-invalid' })
    const off = f.service.registerProvider(f.provider)
    assert.throws(() => f.service.registerProvider({ ...f.provider, id: 'external:other' }), { code: 'external-provider-conflict' })
    assert.equal(f.service.currentProvider(), f.provider.id)
    off()
  } finally { await f.service.dispose() }
})

test('Host reloads cannot accidentally accept an earlier engine revision', async () => {
  const first = fixture()
  first.service.registerProvider(first.provider)
  const revision = first.service.engineState().revision
  await first.service.dispose()
  const replacement = fixture()
  replacement.service.registerProvider(replacement.provider)
  try {
    assert.throws(() => replacement.service.resolveProvider({ provider: replacement.provider.id, engineRevision: revision }), { code: 'speech-engine-changed' })
  } finally { await replacement.service.dispose() }
})

test('readiness, limits and unsupported options fail before requesting audio', async () => {
  const f = fixture()
  const off = f.service.registerProvider(f.provider)
  try {
    f.change({ ready: false })
    await assert.rejects(f.service.synthesize({ text: 'hello' }), { code: 'external-provider-not-ready' })
    assert.equal(f.service.currentProvider(), f.provider.id)
    f.change({ ready: true, maxTextLength: 3 })
    await assert.rejects(f.service.synthesize({ text: 'long text' }), { code: 'text-too-long' })
    await assert.rejects(f.service.synthesize({ text: 'hi', format: 'mp3' }), { code: 'audio-format-unsupported' })
    for (const options of [{ model: 'custom' }, { voice: 'v' }, { speechInstruction: '' }, { voiceRate: 1 }, { voiceDesignPrompt: 'x' }]) {
      await assert.rejects(f.service.synthesize({ text: 'hi', ...options }), { code: 'external-option-unsupported' })
    }
    assert.equal(f.calls.length, 0)
    await assert.rejects(f.service.synthesize({ text: 'hi', format: 'wav', maxDurationMs: 100 }), { code: 'speech-too-long' })
  } finally { off(); await f.service.dispose() }
})

test('configuration changes, caller cancellation and disposal settle uncooperative providers', async () => {
  for (const action of ['change', 'cancel', 'dispose', 'unregister']) {
    let entered
    const ready = new Promise(resolve => { entered = resolve })
    const f = fixture({ synthesize: () => { entered(); return new Promise(() => {}) } })
    const off = f.service.registerProvider(f.provider)
    const controller = new AbortController()
    const revision = f.service.engineState().revision
    const playing = f.service.synthesize({ text: 'hello', signal: controller.signal })
    const result = assert.rejects(playing, { code: action === 'cancel' ? 'tts-canceled' : action === 'dispose' ? 'speech-service-disposed' : 'speech-engine-changed' })
    await ready
    if (action === 'change') f.change({ name: 'Changed' })
    if (action === 'cancel') controller.abort()
    if (action === 'dispose') await f.service.dispose()
    if (action === 'unregister') off()
    await result
    if (action !== 'dispose' && action !== 'cancel') assert.throws(() => f.service.resolveProvider({ engineRevision: revision }), { code: 'speech-engine-changed' })
    off(); await f.service.dispose()
  }
})

test('external errors use public error identity and never expose upstream prose', async () => {
  for (const error of [new Error('private-key at https://secret.example'), new PublicError('rate-limited', 'private-key', 429, 'private-request-id')]) {
    const f = fixture({ synthesize: async () => { throw error } })
    const off = f.service.registerProvider(f.provider)
    try {
      await assert.rejects(f.service.synthesize({ text: 'hello' }), failure => {
        assert.equal(failure.code, error instanceof PublicError ? 'rate-limited' : 'external-synthesis-failed')
        assert.equal(failure.message, failure.code)
        assert.equal(failure.upstreamCode, undefined)
        return true
      })
    } finally { off(); await f.service.dispose() }
  }
})

test('invalid audio, excessive bytes and a mismatched format are rejected', async () => {
  const data = createTestWav()
  assert.equal(validateExternalAudio(data, 'wav', data.length).length, data.length)
  assert.throws(() => validateExternalAudio(data, 'wav', data.length - 1), { code: 'audio-too-large' })
  for (const invalid of [Buffer.from('not audio'), data.subarray(0, data.length - 1), Buffer.from(data)]) {
    if (invalid.length === data.length) invalid.writeUInt16LE(3, 20)
    assert.throws(() => validateExternalAudio(invalid, 'wav', data.length), { code: 'invalid-audio-format' })
  }
  const f = fixture({ synthesize: async () => ({ data, format: 'mp3' }) })
  f.service.registerProvider(f.provider)
  try { await assert.rejects(f.service.synthesize({ text: 'x' }), { code: 'invalid-audio-format' }) } finally { await f.service.dispose() }
})

test('optional PCM streams stay aligned and stop after cancellation', async () => {
  const f = fixture({ async *streamPcm() { yield Uint8Array.of(1); yield Uint8Array.of(2, 3); yield Uint8Array.of(4) } })
  f.service.registerProvider(f.provider)
  try {
    const frames = []
    await f.service.streamPcm({ text: 'hello' }, bytes => { frames.push([...bytes]) })
    assert.deepEqual(frames, [[1, 2], [3, 4]])
    const controller = new AbortController()
    let consumed = 0
    await assert.rejects(f.service.streamPcm({ text: 'hello', signal: controller.signal }, () => { consumed++; controller.abort() }), { code: 'tts-canceled' })
    assert.equal(consumed, 1)
  } finally { await f.service.dispose() }
  for (const streamPcm of [undefined, async function* () {}, async function* () { yield Uint8Array.of(1) }]) {
    const f = fixture(streamPcm ? { streamPcm } : {})
    f.service.registerProvider(f.provider)
    try { await assert.rejects(f.service.streamPcm({ text: 'hello' }, () => {}), { code: streamPcm ? 'invalid-audio-format' : 'streaming-model-unsupported' }) } finally { await f.service.dispose() }
  }
})

test('delivery uses existing permission checks and stops between segments after an engine change', async () => {
  const f = fixture()
  f.service.registerProvider(f.provider)
  f.change({ maxTextLength: 3 })
  const context = { agent: {}, signal: new AbortController().signal }
  const sent = []
  f.service.registerDelivery({ id: 'test', format: 'wav', send: async audio => {
    sent.push(audio.text); f.change({ name: 'new config' }); return { adapter: 'test' }
  } })
  f.service.registerDelivery({ id: 'denied', format: 'wav', check() { throw new PublicError('permission-denied', undefined, 403) }, send() { assert.fail('must not send') } })
  try {
    await assert.rejects(f.service.deliver({ text: 'hello' }, 'denied', context), { code: 'permission-denied' })
    assert.equal(f.calls.length, 0)
    await assert.rejects(f.service.deliver({ text: 'abcdef', splitLongText: true }, 'test', context))
    assert.deepEqual(sent, ['abc'])
  } finally { await f.service.dispose() }
})

async function withRoutes(run) {
  const f = fixture(createTestProvider({ streaming: true }))
  const off = f.service.registerProvider(f.provider)
  const routes = new Map()
  const disposers = []
  const ctx = { speechSynthesis: f.service, get: key => key === 'speechSynthesis' ? f.service : undefined,
    effect(effect) { disposers.push(effect()) }, webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } }
  registerSynthesisRoutes(ctx, () => f.settings)
  registerEngineRoutes(ctx)
  registerOpenApiRoutes(ctx, () => 'management-token')
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const route = routes.get(pathname) ?? [...routes.values()].find(route => route.kind === 'prefix' && pathname.startsWith(route.path))
    if (route) void route.handler(req, res)
    else { res.statusCode = 404; res.end() }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/plugins/xiaomi-mimo-tts`
  try { await run({ ...f, base }) } finally {
    off(); for (const dispose of disposers.reverse()) await dispose?.()
    await f.service.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
}

test('Web routes use the same external engine for audio, PCM and authenticated exports', async () => {
  await withRoutes(async ({ base, service }) => {
    const body = { text: 'hello', engineRevision: service.engineState().revision }
    const post = (route, args = body, extra = {}) => fetch(`${base}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(args) })
    const audio = await post('synthesize')
    assert.equal(audio.headers.get('content-type'), 'audio/wav')
    assert.equal(Buffer.from(await audio.arrayBuffer()).toString('ascii', 8, 12), 'WAVE')
    const pcm = await post('synthesize-stream')
    assert.match(await pcm.text(), /data: \[DONE\]/u)
    const unauthorized = await post('export-audio')
    assert.equal(unauthorized.status, 401)
    const exported = await post('export-audio', { text: 'export', format: 'silk' }, { authorization: 'Bearer management-token' })
    assert.equal(exported.status, 201)
    const result = await exported.json()
    const download = await fetch(new URL(result.url, exported.url))
    assert.ok(isSilk(Buffer.from(await download.arrayBuffer())))
    const stale = await post('synthesize', { ...body, engineRevision: body.engineRevision - 1 })
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).error, 'speech-engine-changed')
  })
})

test('engine metadata rejects cross-origin reads and streams initial and changed state', async () => {
  await withRoutes(async ({ base, service }) => {
    for (const route of ['engine-state', 'engine-events']) {
      const denied = await fetch(`${base}/${route}`, { headers: { origin: 'https://other.example' } })
      assert.equal(denied.status, 403)
      assert.equal(denied.headers.has('access-control-allow-origin'), false)
    }
    const state = await (await fetch(`${base}/engine-state`)).json()
    assert.equal(state.provider, 'external:test-provider')
    const controller = new AbortController()
    const events = await fetch(`${base}/engine-events`, { signal: controller.signal })
    const reader = events.body.getReader()
    const initial = new TextDecoder().decode((await reader.read()).value)
    assert.ok(initial.includes('external:test-provider'))
    service.refreshEngine()
    const changed = new TextDecoder().decode((await reader.read()).value)
    assert.ok(changed.includes(`"revision":${service.engineState().revision}`))
    controller.abort(); await reader.cancel().catch(() => {})
  })
})

test('browser request selection strips inherited overrides and blocks unknown state', () => {
  engineStateStore.accept(externalState)
  try {
    assert.deepEqual(speechRequestBody({ text: 'hello', provider: 'doubao', model: 'seed-tts-2.0', voice: 'v', speechInstruction: 'inherited', voiceRate: 2, format: 'mp3' }), {
      text: 'hello', provider: externalState.provider, engineRevision: 1, format: 'wav',
    })
    engineStateStore.accept({})
    assert.throws(() => speechRequestBody({ text: 'hello' }), /speech-engine-unavailable/u)
  } finally { engineStateStore.accept(builtin) }
})

test('browser state connection marks outages unknown and ignores late refreshes after close', async () => {
  const originalSource = globalThis.EventSource
  const originalFetch = globalThis.fetch
  let source
  let release
  const response = new Promise(resolve => { release = resolve })
  globalThis.EventSource = class { constructor() { source = this } close() { this.closed = true } }
  globalThis.fetch = async () => response
  const store = new EngineStateStore()
  const states = []
  const off = store.subscribe(() => states.push(store.getSnapshot().status))
  try {
    const stop = store.start()
    assert.equal(store.getSnapshot().status, 'connecting')
    source.onopen()
    source.onmessage({ data: JSON.stringify(externalState) })
    assert.equal(store.getSnapshot().engine.provider, externalState.provider)
    source.onerror()
    assert.equal(store.getSnapshot().status, 'unknown')
    assert.equal(store.getSnapshot().engine.provider, externalState.provider)
    source.onmessage({ data: JSON.stringify({ ...externalState, revision: 2 }) })
    assert.equal(store.getSnapshot().status, 'ready')
    stop()
    release(new Response(JSON.stringify(builtin)))
    await settle()
    assert.equal(store.getSnapshot().status, 'inactive')
    assert.equal(store.getSnapshot().engine, null)
    assert.equal(source.closed, true)
    assert.ok(states.includes('unknown'))
  } finally { off(); globalThis.EventSource = originalSource; globalThis.fetch = originalFetch }
})

test('WAV-only preview uses external audio with browser playback rate and real history format', async () => {
  engineStateStore.accept(externalState)
  try {
    await withBrowserPlayback(async state => {
      const history = []
      const views = []
      const player = new PreviewPlayer(view => views.push(view), { stopReplay() {}, add: entry => history.push(entry) })
      const playing = player.play('hello', resolveTtsSettings({ provider: 'doubao', voiceRate: 1.5, localSpeechMode: 'disabled' }))
      await settle()
      assert.equal(state.requests[0].provider, 'external:test-provider')
      assert.equal(state.requests[0].voice, undefined)
      assert.equal(state.media[0].playbackRate, 1.5)
      state.media[0].onended()
      await playing
      assert.equal(history[0].format, 'wav')
      assert.equal(history[0].voiceRateApplied, false)
      assert.equal(views.at(-1).source, 'external')
      await player.dispose()
    }, { fetch: () => new Response('audio', { headers: { 'content-type': 'audio/wav' } }) })
  } finally { engineStateStore.accept(builtin) }
})

test('external takeover saves global settings without writing or validating built-in drafts', async () => {
  const writes = []
  const saved = resolveTtsSettings({ provider: 'doubao' })
  const scope = { getSnapshot: () => ({ value: saved, user: {} }), async mutate(ops) { writes.push(...ops); return true } }
  const draft = { ...saved, doubaoVoice: '', voiceVolume: 0.5 }
  await saveSettingsDraft(scope, draft, { voiceVolume: { kind: 'set' }, doubaoVoice: { kind: 'set' }, apiKey: { kind: 'set' } }, { xiaomi: 'invalid key', doubao: '', breeze: '' }, true)
  assert.deepEqual(writes, [{ op: 'set', path: ['voiceVolume'], value: 0.5 }])
})

test('a partially played external preview never restarts the passage through local fallback', async () => {
  engineStateStore.accept({ ...externalState, maxTextLength: 3 })
  try {
    await withBrowserPlayback(async state => {
      const views = []
      const player = new PreviewPlayer(view => views.push(view))
      try {
        const playing = player.play('abcdef', resolveTtsSettings({ localSpeechMode: 'auto' }))
        await settle()
        state.media[0].onended()
        await playing
        assert.equal(state.utterances.length, 0)
        assert.equal(views.at(-1).status, 'error')
        assert.equal(state.requests.length, 2)
      } finally { await player.dispose() }
    }, { fetch: (_request, state) => state.requests.length === 1 ? new Response('audio', { headers: { 'content-type': 'audio/wav' } }) : new Response('{}', { status: 502 }) })
  } finally { engineStateStore.accept(builtin) }
})

test('public browser play handles complete external audio and stop releases its media', async () => {
  engineStateStore.accept(externalState)
  try {
    await withBrowserPlayback(async state => {
      const ctx = new Context()
      const settings = resolveTtsSettings({ provider: 'doubao', enabled: true, voiceRate: 1.5 })
      const history = []
      const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {}, { stopReplay() {}, add: entry => history.push(entry) })
      try {
        service.play('hello')
        await settle()
        assert.equal(state.requests[0].provider, externalState.provider)
        assert.equal(state.media[0].playbackRate, 1.5)
        assert.equal(service.isBusy(), true)
        assert.equal(history[0].format, 'wav')
        service.stop()
        await settle()
        assert.equal(service.isBusy(), false)
        assert.equal(state.media[0].paused, true)
        assert.equal(state.media[0].src, '')
        assert.ok(state.revoked.length > 0)
      } finally { await service.dispose(); await ctx.fiber.dispose() }
    }, { fetch: () => new Response('audio', { headers: { 'content-type': 'audio/wav' } }) })
  } finally { engineStateStore.accept(builtin) }
})
