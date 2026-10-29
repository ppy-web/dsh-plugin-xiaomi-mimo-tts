import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSilk, decode } from 'silk-wasm'
import { Context } from '@deepseek-ai/cordis'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withDoubaoServer, serverFrame } from './helpers/doubao-server.mjs'

const { HostSpeechService, default: SpeechHost } = await loadClientModule('src/host/speech-service.ts')
const { writeSpeechArtifact, cleanupSpeechArtifacts, SPEECH_FILE_TTL_MS } = await loadClientModule('src/host/speech-files.ts')
const { SpeechModeStore } = await loadClientModule('src/host/speech-mode-store.ts')

function wav(durationMs = 100) {
  const bytes = Buffer.alloc(44 + durationMs * 48)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  return bytes
}

async function withXiaomi(run, respond) {
  const requests = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    requests.push(body)
    if (respond) return respond(req, res, body)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { audio: { data: (body.audio.format === 'mp3' ? Buffer.from('ID3test') : wav()).toString('base64') } } }] }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const settings = resolveTtsSettings({ apiKey: 'sk-speech-test', baseURL: `http://127.0.0.1:${server.address().port}`, requestTimeoutMs: 1000 })
  const service = new HostSpeechService(() => settings)
  try { await run({ service, requests, settings }) } finally {
    service.dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('Host speech uses saved provider settings, cleans text and produces playable WAV, MP3 and SILK', async () => {
  await withXiaomi(async ({ service, requests }) => {
    const audio = await service.synthesize({ text: '**你好**。\n```js\nsecret()\n```', format: 'wav', voice: '冰糖' })
    assert.equal(audio.format, 'wav')
    assert.equal(audio.durationMs, 100)
    assert.equal(audio.data.toString('ascii', 8, 12), 'WAVE')
    assert.equal(requests[0].messages.at(-1).content.includes('secret'), false)
    const silk = await service.synthesize({ text: '语音。', format: 'silk' })
    assert.equal(isSilk(silk.data), true)
    const decoded = await decode(silk.data, 24000)
    assert.ok(decoded.duration >= silk.durationMs && decoded.duration < silk.durationMs + 100, 'codec padding must remain bounded')
    assert.ok(decoded.data.length > 0)
    const mp3 = await service.synthesize({ text: '语音。', format: 'mp3' })
    assert.equal(mp3.contentType, 'audio/mpeg')
    assert.equal(requests[1].audio.format, 'wav', 'SILK is encoded locally from provider WAV')
    await assert.rejects(service.synthesize({ text: '语音。', format: 'silk', maxDurationMs: 50 }), error => error.code === 'speech-too-long')
    const artifact = await service.exportAudio({ text: '导出。', format: 'wav' })
    try { assert.deepEqual(await readFile(artifact.path), audio.data) } finally { await artifact.remove(); await artifact.remove() }
  })
})

test('Host service also synthesizes and encodes Doubao without a browser or HTTP loopback', async () => {
  await withDoubaoServer(async ({ connect }) => {
    const service = new HostSpeechService(() => resolveTtsSettings({ provider: 'doubao', doubaoApiKey: 'test-doubao-key' }), { connectDoubao: connect })
    try {
      const result = await service.synthesize({ text: '豆包语音。', format: 'silk' })
      assert.equal(result.provider, 'doubao')
      assert.equal(isSilk(result.data), true)
    assert.ok(result.durationMs >= 100 && result.durationMs < 200)
    } finally { service.dispose() }
  }, (ws, frame) => {
    if (frame.event !== 200) return false
    ws.send(serverFrame(352, Buffer.alloc(4800), frame.sessionId, 11))
    ws.send(serverFrame(351, {}, frame.sessionId))
    return true
  })
})

test('validation rejects empty or excessive text before spending a provider request', async () => {
  await withXiaomi(async ({ service, requests, settings }) => {
    settings.maxTextLength = 3
    for (const text of ['', '```js\ncode\n```', '超过长度限制']) await assert.rejects(service.synthesize({ text }))
    assert.equal(requests.length, 0)
  })
})

test('oversized provider responses remain size errors when the reader cancels the upstream', async () => {
  await withXiaomi(async ({ service, settings }) => {
    settings.maxWavAudioBytes = 1024
    await assert.rejects(service.synthesize({ text: '大小限制', format: 'wav' }), error => error.code === 'xiaomi-response-too-large')
  }, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(2 * 1024 * 1024) })
    res.flushHeaders()
  })
})

test('cancellation and service disposal abort upstream work and redact provider credentials', async () => {
  await withXiaomi(async ({ service }) => {
    const controller = new AbortController()
    const pending = service.synthesize({ text: '等待', signal: controller.signal })
    controller.abort()
    await assert.rejects(pending, error => error.code === 'tts-canceled')
    const inFlight = service.synthesize({ text: '停止服务' })
    service.dispose()
    await assert.rejects(inFlight, error => error.code === 'speech-service-disposed')
    await assert.rejects(service.synthesize({ text: '以后' }), error => error.code === 'speech-service-disposed')
  }, () => {})
  await withXiaomi(async ({ service }) => {
    await assert.rejects(service.synthesize({ text: '失败' }), error => !error.message.includes('sk-speech-test') && error.code === 'xiaomi-api-error')
  }, (_req, res) => { res.statusCode = 403; res.end(JSON.stringify({ error: 'Bad key: sk-speech-test' })) })
})

test('delivery adapters receive audio and context, unregister safely and never send after cancellation', async () => {
  await withXiaomi(async ({ service, requests }) => {
    const sent = []
    const agent = { id: 'session' }
    const unregister = service.registerDelivery({ id: 'example-channel', format: 'wav', async send(audio, context) { sent.push({ audio, context }); return { adapter: 'example-channel', messageId: 'one' } } })
    const signal = new AbortController().signal
    assert.equal((await service.deliver({ text: '通用能力' }, 'example-channel', { agent, signal })).messageId, 'one')
    assert.equal(sent[0].context.agent, agent)
    assert.equal(sent[0].audio.format, 'wav')
    const canceled = new AbortController(); canceled.abort()
    await assert.rejects(service.deliver({ text: '不发送' }, 'example-channel', { agent, signal: canceled.signal }))
    assert.equal(sent.length, 1)
    unregister(); unregister()
    await assert.rejects(service.deliver({ text: '已卸载' }, 'example-channel', { agent, signal }), error => error.code === 'speech-delivery-unavailable')
    service.registerDelivery({ id: 'offline', format: 'silk', check() { throw new Error('transport offline') }, async send() { assert.fail('offline sender must not run') } })
    const before = requests.length
    await assert.rejects(service.deliver({ text: '离线不消耗合成请求' }, 'offline', { agent, signal }))
    assert.equal(requests.length, before)
  })
})

test('managed files expire without deleting unrelated files and session modes persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-speech-'))
  try {
    const old = await writeSpeechArtifact({ data: wav(), format: 'wav', contentType: 'audio/wav' }, directory)
    const recent = await writeSpeechArtifact({ data: wav(), format: 'wav', contentType: 'audio/wav' }, directory)
    const unrelated = join(directory, 'user-audio.wav')
    await writeFile(unrelated, 'keep')
    const before = new Date(Date.now() - SPEECH_FILE_TTL_MS - 10000)
    await utimes(old.path, before, before); await utimes(unrelated, before, before)
    await cleanupSpeechArtifacts(directory)
    await assert.rejects(readFile(old.path), { code: 'ENOENT' })
    assert.ok((await readFile(recent.path)).length > 0)
    assert.equal(await readFile(unrelated, 'utf8'), 'keep')
    const store = new SpeechModeStore(join(directory, 'modes'))
    await store.save('../one', 'auto'); await store.save('two', 'manual')
    const restored = new SpeechModeStore(join(directory, 'modes'))
    assert.equal(await restored.load('../one', 'manual'), 'auto')
    assert.equal(await restored.load('two', 'auto'), 'manual')
    assert.equal(await restored.load('new', 'manual'), 'manual')
    assert.equal((await readdir(join(directory, 'modes'))).length, 2)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('Cordis registration publishes the Host service and withdraws it on unload', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(SpeechHost, { current: () => resolveTtsSettings() })
  await new Promise(resolve => setImmediate(resolve))
  const service = ctx.speechSynthesis
  assert.equal(service.hasDelivery('file'), true)
  await fiber.dispose()
  assert.equal(ctx.get('speechSynthesis'), undefined)
  await assert.rejects(service.synthesize({ text: 'disposed' }), error => error.code === 'speech-service-disposed')
  await ctx.fiber.dispose()
})

test('disabling one delivery cancels its pending job, blocks synthesis and keeps other deliveries working', async () => {
  await withXiaomi(async ({ service, requests }) => {
    const agent = { id: 'session' }, signal = new AbortController().signal
    let qqStarted, otherStarted, finishOther
    const qqReady = new Promise(resolve => { qqStarted = resolve })
    const otherReady = new Promise(resolve => { otherStarted = resolve })
    service.registerDelivery({ id: 'qqbot', format: 'wav', send(_audio, context) {
      qqStarted()
      return new Promise((_resolve, reject) => { context.signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true }) })
    } })
    service.registerDelivery({ id: 'other', format: 'wav', send(_audio, context) {
      otherStarted(context.signal)
      return new Promise(resolve => { finishOther = () => resolve({ adapter: 'other' }) })
    } })
    const qq = service.deliver({ text: 'QQ 语音' }, 'qqbot', { agent, signal })
    const rejected = assert.rejects(qq)
    const other = service.deliver({ text: '其他渠道' }, 'other', { agent, signal })
    const [, otherSignal] = await Promise.all([qqReady, otherReady])
    service.setDeliveryEnabled('qqbot', false)
    await rejected
    assert.equal(service.hasDelivery('qqbot'), false)
    assert.equal(service.hasDelivery('other'), true)
    assert.equal(otherSignal.aborted, false)
    const before = requests.length
    await assert.rejects(service.deliver({ text: '已关闭' }, 'qqbot', { agent, signal }), error => error.code === 'speech-delivery-unavailable')
    assert.equal(requests.length, before)
    finishOther()
    assert.deepEqual(await other, { adapter: 'other' })
    service.setDeliveryEnabled('qqbot', true)
    assert.equal(service.hasDelivery('qqbot'), true)
  })
})

test('Host integration settings apply live and unsubscribe when the service unloads', async () => {
  const ctx = new Context(), listeners = new Set()
  let settings = resolveTtsSettings({})
  const fiber = ctx.plugin(SpeechHost, {
    current: () => settings,
    updates(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  })
  try {
    await new Promise(resolve => setImmediate(resolve))
    const service = ctx.speechSynthesis
    service.registerDelivery({ id: 'qqbot', format: 'wav', async send() { return { adapter: 'qqbot' } } })
    assert.equal(service.hasDelivery('qqbot'), true)
    assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), false)
    settings = resolveTtsSettings({ qqbotEnabled: true })
    for (const listener of listeners) listener()
    assert.equal(service.hasDelivery('qqbot'), true)
    assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), true)
    settings = resolveTtsSettings({ qqbotEnabled: false })
    for (const listener of listeners) listener()
    assert.equal(service.hasDelivery('qqbot'), true)
    assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), false)
    assert.equal(service.hasDelivery('file'), true)
    await fiber.dispose()
    assert.equal(listeners.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('QQ component and source implement automatic, on-demand and disabled delivery independently', async () => {
  await withXiaomi(async ({ service, requests }) => {
    const agent = { id: 'qq' }, signal = new AbortController().signal, sent = []
    const remove = service.registerDelivery({ id: 'qqbot', format: 'wav', async send(audio) { sent.push(audio.text); return { adapter: 'qqbot' } } })
    service.setAutomaticDeliveryEnabled('qqbot', true)
    await service.deliver({ text: '来源开启，自动发送' }, 'qqbot', { agent, signal, automatic: true })
    assert.equal(sent.length, 1)
    service.setAutomaticDeliveryEnabled('qqbot', false)
    const before = requests.length
    await assert.rejects(service.deliver({ text: '不自动发送' }, 'qqbot', { agent, signal, automatic: true }), error => error.code === 'automatic-speech-disabled')
    assert.equal(requests.length, before)
    await service.deliver({ text: '来源关闭，按需发送' }, 'qqbot', { agent, signal })
    assert.equal(sent.length, 2)
    remove()
    service.setAutomaticDeliveryEnabled('qqbot', true)
    for (const automatic of [false, true]) await assert.rejects(service.deliver({ text: '组件关闭' }, 'qqbot', { agent, signal, automatic }), error => error.code === 'speech-delivery-unavailable')
    assert.equal(sent.length, 2)
  })
})

test('long delivery sends every provider-sized part in order and stops if the component is removed', async () => {
  await withXiaomi(async ({ service, requests, settings }) => {
    settings.maxTextLength = 12
    const text = '长回复不会因长度被丢弃。'.repeat(10)
    const sent = [], agent = { id: 'qq' }, signal = new AbortController().signal
    const remove = service.registerDelivery({ id: 'qqbot', format: 'wav', async send(audio) { sent.push(audio.text); return { adapter: 'qqbot' } } })
    service.setAutomaticDeliveryEnabled('qqbot', true)
    await service.deliver({ text, splitLongText: true }, 'qqbot', { agent, signal, automatic: true })
    assert.equal(sent.join(''), (await import('../lib/shared.js')).prepareTtsText(text))
    assert.ok(sent.length > 1)
    assert.ok(requests.every(request => request.messages.at(-1).content.length <= 12))
    remove()
    let count = 0
    const unregister = service.registerDelivery({ id: 'qqbot', format: 'wav', async send() {
      count++; unregister(); return { adapter: 'qqbot' }
    } })
    await assert.rejects(service.deliver({ text, splitLongText: true }, 'qqbot', { agent, signal }))
    assert.equal(count, 1)
  })
})

test('turning the source off cancels automatic jobs without canceling explicit jobs', async () => {
  await withXiaomi(async ({ service }) => {
    const agent = { id: 'qq' }, signal = new AbortController().signal
    let autoStarted, manualStarted, finishManual
    const autoReady = new Promise(resolve => { autoStarted = resolve })
    const manualReady = new Promise(resolve => { manualStarted = resolve })
    service.registerDelivery({ id: 'qqbot', format: 'wav', send(_audio, context) {
      if (context.automatic) {
        autoStarted()
        return new Promise((_resolve, reject) => { context.signal.addEventListener('abort', () => reject(new Error('automatic canceled')), { once: true }) })
      }
      manualStarted(context.signal)
      return new Promise(resolve => { finishManual = () => resolve({ adapter: 'qqbot' }) })
    } })
    service.setAutomaticDeliveryEnabled('qqbot', true)
    const automatic = service.deliver({ text: '自动' }, 'qqbot', { agent, signal, automatic: true })
    const rejected = assert.rejects(automatic)
    const manual = service.deliver({ text: '按需' }, 'qqbot', { agent, signal })
    const [, manualSignal] = await Promise.all([autoReady, manualReady])
    service.setAutomaticDeliveryEnabled('qqbot', false)
    await rejected
    assert.equal(manualSignal.aborted, false)
    finishManual()
    assert.deepEqual(await manual, { adapter: 'qqbot' })
  })
})
