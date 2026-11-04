import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { resolveTtsSettings, TTS_ROUTE, TTS_STREAM_ROUTE, TTS_DUPLEX_ROUTE } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withDoubaoServer, serverFrame } from './helpers/doubao-server.mjs'
import { apply, Config } from '../lib/index.js'

const { registerSynthesisRoutes } = await loadClientModule('src/host/synthesis-routes.ts')
const { DuplexPcmStream } = await loadClientModule('src/client/playback/duplex-pcm.ts')

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
    apiKey: 'sk-private-xiaomi', doubaoApiKey: 'private-doubao', breezeApiKey: 'private-breeze', provider: 'doubao',
    petFeedEnabled: true, petFeedTarget: 'legacy-pet', petAnnouncementTypes: ['completed'],
  }))
  try {
    const handler = routes.get('/plugins/xiaomi-mimo-tts/api-key-status')
    for (const provider of ['xiaomi', 'doubao', 'breeze', undefined, 'invalid']) {
      const response = { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value) } }
      handler({ method: 'GET', url: `/plugins/xiaomi-mimo-tts/api-key-status${provider ? `?provider=${provider}` : ''}` }, response)
      assert.equal(response.statusCode, provider === 'invalid' ? 400 : 200)
      if (provider !== 'invalid') assert.deepEqual(response.body, { provider: provider ?? 'doubao', configured: true, supported: true })
      assert.equal(JSON.stringify(response.body).includes('private'), false)
    }
  } finally { for (const dispose of disposers.reverse()) dispose() }
})

async function withRoutes(run, connectDoubao, extra = {}) {
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
  }, () => settings, { connectDoubao })
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
