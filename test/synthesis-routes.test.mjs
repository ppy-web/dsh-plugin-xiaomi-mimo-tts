import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { resolveTtsSettings, TTS_ROUTE, TTS_STREAM_ROUTE, TTS_DUPLEX_ROUTE } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withDeepseekServer } from './helpers/deepseek-server.mjs'
import { withDoubaoServer, serverFrame } from './helpers/doubao-server.mjs'
import { apply, Config } from '../lib/index.js'
import { isSilk } from 'silk-wasm'

const { registerSynthesisRoutes } = await loadClientModule('src/host/synthesis-routes.ts')
const { DuplexPcmStream } = await loadClientModule('src/client/playback/duplex-pcm.ts')
const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')

test('key status reads each provider with legacy profile fields without exposing saved secrets', () => {
  const routes = new Map()
  const disposers = []
  const ctx = {
    inject() {},
    effect(effect) { disposers.push(effect()) },
    webServer: {
      register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) },
      registerUpgrade() { return () => {} },
    },
  }
  apply(ctx, Config({
    apiKey: 'sk-private-xiaomi', doubaoApiKey: 'private-doubao', breezeApiKey: 'private-breeze', deepseekApiKey: 'private-deepseek', provider: 'doubao',
    petFeedEnabled: true, petFeedTarget: 'legacy-pet', petAnnouncementTypes: ['completed'],
  }))
  try {
    const handler = routes.get('/plugins/xiaomi-mimo-tts/api-key-status')
    for (const provider of ['xiaomi', 'doubao', 'breeze', 'deepseek', undefined, 'invalid']) {
      const response = { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value) } }
      handler({ method: 'GET', url: `/plugins/xiaomi-mimo-tts/api-key-status${provider ? `?provider=${provider}` : ''}` }, response)
      assert.equal(response.statusCode, provider === 'invalid' ? 400 : 200)
      if (provider !== 'invalid') assert.deepEqual(response.body, { provider: provider ?? 'doubao', configured: true, supported: true })
      assert.equal(JSON.stringify(response.body).includes('private'), false)
    }
  } finally { for (const dispose of disposers.reverse()) dispose() }
})

async function withRoutes(run, connectDoubao, extra = {}, connectDeepseek) {
  const routes = new Map()
  const upgrades = new Map()
  const disposers = []
  let settings = resolveTtsSettings({ provider: 'doubao', doubaoApiKey: 'local-test-key', requestTimeoutMs: 1000, ...extra })
  registerSynthesisRoutes({
    effect(effect) { disposers.push(effect()) },
    webServer: {
      register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) },
      registerUpgrade(route) { upgrades.set(route.path, route.handler); return () => upgrades.delete(route.path) },
    },
  }, () => settings, { connectDoubao, connectDeepseek })
  const server = createServer((req, res) => {
    const handler = routes.get(new URL(req.url, 'http://localhost').pathname)
    if (handler) void handler(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
    else { res.statusCode = 404; res.end() }
  })
  server.on('upgrade', (req, socket, head) => {
    const handler = upgrades.get(new URL(req.url, 'http://localhost').pathname)
    if (handler) handler(req, socket, head)
    else socket.destroy()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try { await run({ base, change: next => { settings = resolveTtsSettings({ ...settings, ...next }) } }) } finally {
    for (const dispose of disposers.reverse()) dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

const post = (base, path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('Doubao HTTP routes return playable WAV and compatible PCM SSE without exposing the key', async () => {
  await withDoubaoServer(async ({ connect, frames }) => withRoutes(async ({ base }) => {
    const wav = await post(base, TTS_ROUTE, { text: '完整音频。', format: 'wav', voiceRate: 1.6, speechInstruction: '完整音频的指令' })
    assert.equal(wav.status, 200)
    assert.equal(wav.headers.get('content-type'), 'audio/wav')
    const bytes = Buffer.from(await wav.arrayBuffer())
    assert.equal(bytes.readUInt32LE(24), 24000)
    assert.equal(bytes.readUInt32LE(40), 4)
    const sse = await post(base, TTS_STREAM_ROUTE, { text: '流式音频。', voiceRate: 0.8, speechInstruction: '流式音频的指令' })
    assert.equal(sse.status, 200)
    const text = await sse.text()
    assert.match(text, /\[DONE\]/)
    assert.equal(JSON.parse(text.split('\n')[0].slice(6)).choices[0].delta.audio.data, 'AAABAA==')
    assert.equal(text.includes('local-test-key'), false)
    assert.equal(frames.filter(frame => frame.event === 100).length, 2)
    assert.deepEqual(frames.filter(frame => frame.event === 100).map(frame => frame.payload.req_params.audio_params.speech_rate), [60, -20])
    assert.deepEqual(frames.filter(frame => frame.event === 100).map(frame => JSON.parse(frame.payload.req_params.additions).context_texts), [['完整音频的指令'], ['流式音频的指令']])
  }, connect))
})

test('HTTP rejects invalid provider, model, missing clone ID and oversized audio', async () => {
  await withDoubaoServer(async ({ connect }) => withRoutes(async ({ base, change }) => {
    for (const body of [null, { text: '你好', provider: 'unknown' }, { text: '你好', model: 'mimo-v2.5-tts' }]) {
      const response = await post(base, TTS_ROUTE, body)
      assert.equal(response.status, 400)
    }
    const missing = await post(base, TTS_ROUTE, { text: '你好', model: 'seed-icl-2.0' })
    assert.equal(missing.status, 400)
    assert.equal((await missing.json()).error, 'voice-required')
    change({ maxWavAudioBytes: 45 })
    const large = await post(base, TTS_ROUTE, { text: '你好', format: 'wav' })
    assert.equal(large.status, 502)
    assert.equal((await large.json()).error, 'audio-too-large')
  }, connect))
})

for (const desktop of [false, true]) test(`${desktop ? 'desktop' : 'browser'} duplex route proxies streaming text and binary audio through the real Host state machine`, async () => {
  await withDoubaoServer(async ({ connect, frames }) => withRoutes(async ({ base, change }) => {
    const names = ['WebSocket', 'document', 'location', '__DSH_TRANSPORT__']
    const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
    const values = [
      // DSH desktop rewrites the renderer's Origin and adds its Host cookie for this URL.
      class extends WebSocket { constructor(url) { super(url, { origin: base }) } },
      { baseURI: desktop ? 'dsh-app://app/' : base + '/' },
      { href: desktop ? 'dsh-app://app/chat/session' : base + '/' },
      desktop ? { streamBaseUrl: base } : undefined,
    ]
    for (const [index, name] of names.entries()) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: values[index] })
    try {
      let received
      const first = new Promise(resolve => { received = resolve })
      const chunks = []
      const stream = new DuplexPcmStream({ provider: 'doubao', model: 'seed-tts-2.0', voice: 'test-voice', voiceRate: 1.4, speechInstruction: '原始指令' }, new AbortController().signal, bytes => { chunks.push(...bytes); received() })
      stream.append('第一句。')
      await first
      // A running session retains the original credentials and voice snapshot.
      change({ doubaoVoice: 'changed-voice', doubaoApiKey: 'changed-key', voiceRate: 0.5, doubaoInstruction: '后续指令' })
      stream.append('第二句。')
      await stream.finish()
      assert.deepEqual(chunks, [0, 0, 1, 0, 0, 0, 1, 0])
      assert.equal(frames.filter(frame => frame.event === 100).length, 1)
      assert.equal(frames.find(frame => frame.event === 100).payload.req_params.speaker, 'test-voice')
      assert.equal(frames.find(frame => frame.event === 100).payload.req_params.audio_params.speech_rate, 40)
      assert.deepEqual(JSON.parse(frames.find(frame => frame.event === 100).payload.req_params.additions), { context_texts: ['原始指令'] })
    } finally {
      for (const [index, name] of names.entries()) {
        if (originals[index]) Object.defineProperty(globalThis, name, originals[index])
        else delete globalThis[name]
      }
    }
  }, connect))
})

test('duplex route rejects cross-origin upgrades and invalid command ordering', async () => {
  await withDoubaoServer(async ({ connect }) => withRoutes(async ({ base }) => {
    const forbidden = new WebSocket(base.replace('http:', 'ws:') + TTS_DUPLEX_ROUTE, { origin: 'https://other.example' })
    const rejected = await new Promise(resolve => { forbidden.on('error', error => resolve(error)); forbidden.on('unexpected-response', (_req, response) => { response.resume(); resolve(response.statusCode); forbidden.terminate() }) })
    assert.equal(rejected, 403)
    const socket = new WebSocket(base.replace('http:', 'ws:') + TTS_DUPLEX_ROUTE, { origin: base })
    await once(socket, 'open')
    socket.send(JSON.stringify({ type: 'text', text: 'out of order' }))
    const [message] = await once(socket, 'message')
    assert.equal(JSON.parse(message.toString()).error, 'invalid-session-state')
    socket.close()
  }, connect))
})

test('stream errors after headers use SSE and redact upstream credential echoes', async () => {
  await withDoubaoServer(async ({ connect }) => withRoutes(async ({ base }) => {
    const response = await post(base, TTS_STREAM_ROUTE, { text: '你好' })
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.match(text, /\[redacted\]/)
    assert.equal(text.includes('local-test-key'), false)
    assert.equal(text.includes('[DONE]'), false)
  }, connect), (socket, frame) => {
    if (frame.event === 200) {
      socket.send(serverFrame(352, Buffer.from([0, 0]), frame.sessionId, 11))
      socket.send(serverFrame(153, { message: 'speaker failed; key local-test-key' }, frame.sessionId))
      return true
    }
  })
})

const deepseekSettings = { provider: 'deepseek', deepseekEnabled: true, deepseekApiKey: 'test-private-deepseek' }

test('DeepSeek HTTP complete and SSE routes synthesize only through the official WebSocket protocol', async () => {
  await withDeepseekServer(({ connect, sessions }) => withRoutes(async ({ base }) => {
    const response = await post(base, TTS_ROUTE, { text: '完整音频。', voice: 'tide' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'audio/wav')
    const audio = Buffer.from(await response.arrayBuffer())
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE')
    assert.equal(audio.readUInt16LE(22), 1)
    assert.equal(audio.readUInt32LE(24), 24000)
    assert.equal(audio.readUInt16LE(34), 16)
    assert.deepEqual(audio.subarray(44), Buffer.alloc(4800, 1))
    const sse = await post(base, TTS_STREAM_ROUTE, { text: '流式音频。' })
    const events = (await sse.text()).trim().split('\n\n').map(line => line.slice(6))
    assert.equal(sse.status, 200)
    assert.equal(events.pop(), '[DONE]')
    assert.deepEqual(Buffer.concat(events.map(event => Buffer.from(JSON.parse(event).choices[0].delta.audio.data, 'base64'))), audio.subarray(44))
    assert.deepEqual(sessions.map(session => session.commands.map(command => command.event)), [['text', 'finish_text'], ['text', 'finish_text']])
    for (const session of sessions) assert.equal(session.authorization, 'Bearer test-private-deepseek')
    const mp3 = await post(base, TTS_ROUTE, { text: '格式。', format: 'mp3' })
    assert.equal(mp3.status, 400)
    assert.equal((await mp3.json()).error, 'audio-format-unsupported')
    const excessive = await post(base, TTS_ROUTE, { text: '汉'.repeat(5001) })
    assert.equal(excessive.status, 413)
    assert.equal((await excessive.json()).error, 'text-too-long')
    assert.equal(sessions.length, 2, 'format and text limits reject before contacting the paid service')
  }, undefined, deepseekSettings, connect))
})

test('DeepSeek browser duplex forwards multiple text chunks, plays before finish and preserves spacing', async () => {
  await withDeepseekServer(({ connect, sessions }) => withRoutes(async ({ base }) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + TTS_DUPLEX_ROUTE, { origin: base })
    try {
      await once(socket, 'open')
      const send = command => socket.send(JSON.stringify(command))
      send({ type: 'start', selection: { provider: 'deepseek', model: 'deepseek-tts', voice: 'tide' } })
      const [ready] = await once(socket, 'message')
      assert.equal(JSON.parse(ready.toString()).sampleRate, 24000)
      send({ type: 'text', text: 'Hello ' })
      const [early, binary] = await once(socket, 'message')
      assert.equal(binary, true)
      assert.deepEqual(early, Buffer.alloc(4800, 1))
      const terminal = Promise.withResolvers()
      const chunks = []
      socket.on('message', (data, isBinary) => {
        if (isBinary) chunks.push(data)
        else terminal.resolve(JSON.parse(data.toString()))
      })
      send({ type: 'text', text: 'world.' })
      send({ type: 'finish' })
      assert.equal((await terminal.promise).type, 'done')
      assert.deepEqual(Buffer.concat(chunks), early)
      assert.deepEqual(sessions[0].commands, [{ event: 'text', text: 'Hello ' }, { event: 'text', text: 'world.' }, { event: 'finish_text' }])
      const upstream = new URL(sessions[0].url, 'http://localhost')
      assert.equal(upstream.searchParams.get('voice_id'), 'tide')
      assert.equal(upstream.searchParams.get('format'), 'pcm')
      assert.equal(upstream.searchParams.get('filter_markdown'), 'false')
    } finally { socket.terminate() }
  }, undefined, deepseekSettings, connect))
})

test('DeepSeek requires successful termination, whole PCM samples and redacts upstream failures', async () => {
  for (const [fixture, error, status] of [
    [{ terminal: 'content_filter' }, 'content-filtered', 400],
    [{ terminal: 'close' }, 'stream-incomplete', 502],
    [{ pcm: Buffer.from([1, 2, 3]) }, 'stream-incomplete', 502],
    [{ verifyClient: (_info, accept) => accept(false, 401) }, 'api-key-rejected', 401],
  ]) await withDeepseekServer(({ connect }) => withRoutes(async ({ base }) => {
    const response = await post(base, TTS_ROUTE, { text: '失败测试。' })
    assert.equal(response.status, status)
    const result = await response.json()
    assert.equal(result.error, error)
    assert.ok(!JSON.stringify(result).includes(deepseekSettings.deepseekApiKey))
  }, undefined, deepseekSettings, connect), fixture)
})

test('explicit DeepSeek host requests support SILK delivery and cancel stalled PCM work', async () => {
  await withDeepseekServer(async ({ connect, sessions }) => {
    const service = new HostSpeechService(() => resolveTtsSettings({ deepseekApiKey: deepseekSettings.deepseekApiKey }), { connectDeepseek: connect })
    try {
      assert.equal(service.currentProvider(), 'xiaomi')
      const capability = service.capabilities().providers.find(provider => provider.id === 'deepseek')
      assert.ok(capability.ready && capability.models[0].duplex)
      assert.equal(capability.models[0].voiceRate, false)
      const deliveries = []
      service.registerDelivery({ id: 'test-qq', format: 'silk', async send(audio) { deliveries.push(audio); return { adapter: 'test-qq' } } })
      await service.deliver({ text: '汉'.repeat(5001), provider: 'deepseek', splitLongText: true }, 'test-qq',
        { agent: { id: 'qq', session: { header: {} } }, signal: new AbortController().signal })
      assert.equal(deliveries.length, 2)
      for (const audio of deliveries) {
        assert.equal(audio.provider, 'deepseek')
        assert.equal(isSilk(audio.data), true)
      }
      assert.equal(sessions.flatMap(session => session.commands.filter(command => command.event === 'text')).map(command => command.text).join(''), '汉'.repeat(5001))
      const controller = new AbortController()
      const audioStarted = Promise.withResolvers()
      const task = service.streamPcm({ text: '取消。', provider: 'deepseek', signal: controller.signal }, () => {
        audioStarted.resolve()
        return new Promise(() => {})
      })
      await audioStarted.promise
      controller.abort()
      await assert.rejects(task, { name: 'AbortError' })
    } finally { await service.dispose() }
  })
})
