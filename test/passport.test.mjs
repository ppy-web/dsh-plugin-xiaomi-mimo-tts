import assert from 'node:assert/strict'
import test from 'node:test'
import { once, EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { Context } from '@deepseek-ai/cordis'
import { createServer } from 'node:net'
import * as passport from '../lib/passport.js'
import { PassportBridge, PassportSession, PassportSessionStore, PcmUtterances, pcmWave, playbackPcm } from '../lib/passport.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
const TOKEN = 'passport-device-test-token-123456789'
const defaults = {
  host: '127.0.0.1', port: 0, accessToken: TOKEN, deviceId: '',
  silenceMs: 200, minSpeechMs: 100, maxRecordingSeconds: 2, speechThreshold: 0.015,
  maxReplySeconds: 2, requestTimeoutMs: 5000,
}

function tone(ms = 200, rate = 16000) {
  const result = Buffer.alloc(Math.round(ms * rate / 1000) * 2)
  for (let i = 0; i < result.length / 2; i++) result.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 880) * 6000), i * 2)
  return result
}

function hello(id = 'bean_test', extra = {}) {
  return { type: 'session.hello', protocol: { min: '7.0.0', max: '7.0.0' }, client: { instance_id: id },
    capabilities: ['input.audio', 'playback.receipts'], connection: { input_enabled: true }, ...extra }
}

class Device {
  events = []
  emitter = new EventEmitter()
  constructor(url, options = {}) {
    this.ws = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` }, ...options })
    this.ws.on('error', () => {})
    this.ws.on('message', data => { const event = JSON.parse(data); this.events.push(event); this.emitter.emit('event', event) })
    this.closed = new Promise(resolve => this.ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })))
  }
  send(event) { this.ws.send(JSON.stringify(event)) }
  wait(type, predicate = () => true) {
    const existing = this.events.find(event => event.type === type && predicate(event))
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.emitter.off('event', listener); reject(new Error(`No ${type}`)) }, 3000)
      const listener = event => {
        if (event.type !== type || !predicate(event)) return
        clearTimeout(timer); this.emitter.off('event', listener); resolve(event)
      }
      this.emitter.on('event', listener)
    })
  }
  audio(pcm = Buffer.concat([tone(), Buffer.alloc(6400)])) {
    this.send({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') })
  }
  async stop() { this.ws.terminate(); await this.closed }
}

async function harness(t, overrides = {}) {
  const submitted = [], recognized = [], deliveries = [], errors = [], delivered = []
  let cancelled = 0, seq = 0
  const agent = { id: `passport-${randomUUID()}`, session: { header: {} } }
  const session = {
    agent, acquire: async () => ({ agent, dispose: async () => {} }),
    submit: text => submitted.push(text), cancel: () => { cancelled++ }, ...overrides.session,
  }
  const recognition = {
    snapshot: () => ({ selection: { providerId: 'host-selected', language: 'zh' },
      providers: [{ id: 'host-selected', preparation: { phase: 'ready' } }] }),
    resolve: request => ({ ...request, provider: { info: { id: 'host-selected' } }, language: 'zh' }),
    transcribe: async (spec, signal) => { recognized.push({ spec, signal }); return { text: '你好' } },
    ...overrides.recognition,
  }
  const synthesis = {
    hasDelivery: id => id === 'passport',
    async deliver(request, id, context) {
      deliveries.push({ request, id, context })
      await bridge.adapter.check(context)
      const data = overrides.synthesize ? await overrides.synthesize(request) : pcmWave(tone(40))
      context.signal.throwIfAborted()
      return bridge.adapter.send({ data, text: request.text, format: 'wav', contentType: 'audio/wav', provider: 'xiaomi' }, context)
    },
  }
  const bridge = new PassportBridge({ ...defaults, ...overrides.options }, session, recognition, synthesis,
    code => errors.push(code), value => delivered.push(value))
  await bridge.listen()
  const url = `ws://127.0.0.1:${bridge.address.port}/api/realtime`
  const devices = []
  t.after(async () => { await bridge.dispose(); await Promise.all(devices.map(device => device.stop())) })
  async function connect(id = 'bean_test', extra = {}) {
    const device = new Device(url)
    devices.push(device)
    await once(device.ws, 'open')
    device.send(hello(id, extra))
    await device.wait('voice.ready')
    return device
  }
  function observe(type, data, source = agent.session) {
    const event = { type, data, seq: seq++ }
    bridge.observe(source, event)
    return event
  }
  function reply(text = '回复', turn = 1) {
    observe('turn/start', { turn })
    observe('assistant/message', { turn, step: 1, message: { content: [{ type: 'text', text }] } })
    return observe('turn/end', { turn, reason: { kind: 'completed' } })
  }
  return { bridge, url, connect, observe, reply, agent, submitted, recognized, deliveries, errors, delivered, session,
    get cancelled() { return cancelled } }
}

test('feedback reports an empty transcript once and keeps the same microphone connection for the next turn', async t => {
  let attempts = 0
  const run = await harness(t, { recognition: { transcribe: async () => ({ text: ++attempts === 1 ? ' ' : '再试' }) } })
  const device = await run.connect('feedback', { capabilities: ['input.audio', 'playback.receipts', 'voice.feedback'] })
  device.audio()
  const failed = await device.wait('voice.result', event => event.status === 'failed')
  assert.equal(failed.code, 'passport-no-speech')
  assert.equal(device.ws.readyState, WebSocket.OPEN)
  assert.equal(run.submitted.length, 0)
  device.audio(); await device.wait('voice.progress', event => event.phase === 'thinking')
  assert.deepEqual(run.submitted, ['再试'])
  run.reply('第二轮正常')
  const done = await device.wait('audio.done')
  device.send({ type: 'playback.ended', responseId: done.responseId })
  await device.wait('voice.result', event => event.status === 'completed')
  assert.equal(device.events.filter(event => event.type === 'voice.result' && event.turnId === failed.turnId).length, 1)
})

test('a failed synthesis ends its turn without a reconnect or waiting for the whole request timeout', async t => {
  let calls = 0
  const run = await harness(t, { synthesize: async () => { if (!calls++) throw new Error('private-upstream-secret'); return pcmWave(tone(40)) } })
  const device = await run.connect('feedback', { capabilities: ['input.audio', 'playback.receipts', 'voice.feedback'] })
  device.audio(); await device.wait('voice.progress', event => event.phase === 'thinking'); run.reply()
  const failed = await device.wait('voice.result', event => event.status === 'failed')
  assert.equal(failed.code, 'passport-speech-failed')
  await device.wait('playback.clear')
  assert.equal(device.ws.readyState, WebSocket.OPEN)
  device.audio(); await device.wait('voice.progress', event => event.phase === 'thinking' && event.turnId !== failed.turnId); run.reply('恢复了', 2)
  const done = await device.wait('audio.done')
  device.send({ type: 'playback.ended', responseId: done.responseId })
  await device.wait('voice.result', event => event.status === 'completed')
  assert.equal(JSON.stringify(device.events).includes('private-upstream-secret'), false)
})

test('stream delivery sends the first samples before the source finishes and still waits for speaker drain', async t => {
  const run = await harness(t), device = await run.connect()
  device.audio(); await device.wait('voice.state', event => event.state === 'processing'); await settle()
  const rest = Promise.withResolvers()
  let finished = false
  const sending = run.bridge.adapter.sendStream((async function* () {
    yield Buffer.alloc(960, 1); await rest.promise; yield Buffer.alloc(38, 2); finished = true
  })(), { agent: run.agent, signal: new AbortController().signal })
  const first = await device.wait('audio.delta')
  assert.equal(finished, false)
  rest.resolve(); const done = await device.wait('audio.done')
  let delivered = false; void sending.then(() => { delivered = true })
  await settle(); assert.equal(delivered, false)
  device.send({ type: 'playback.ended', responseId: 'old' }); await settle(); assert.equal(delivered, false)
  device.send({ type: 'playback.ended', responseId: done.responseId }); await sending
  assert.equal(done.responseId, first.responseId)
  assert.deepEqual(Buffer.concat(device.events.filter(e => e.type === 'audio.delta').map(e => Buffer.from(e.audio, 'base64'))), Buffer.concat([Buffer.alloc(960, 1), Buffer.alloc(38, 2)]))
})

test('device audio uses the Host recognizer and only its dedicated final reply is delivered once', async t => {
  const run = await harness(t), device = await run.connect()
  device.audio()
  await device.wait('voice.state', event => event.state === 'processing')
  await settle()
  assert.deepEqual(run.submitted, ['你好'])
  assert.equal(run.recognized[0].spec.provider.info.id, 'host-selected')
  const wave = run.recognized[0].spec.audio
  assert.equal(wave.readUInt32LE(24), 16000)
  assert.equal(wave.readUInt16LE(22), 1)
  assert.equal(wave.length, wave.readUInt32LE(40) + 44)
  run.observe('assistant/message', { turn: 1, message: { content: [{ type: 'text', text: '不得泄漏' }] } }, { header: {} })
  const end = run.reply('正确回复', 2)
  run.bridge.observe(run.agent.session, end)
  const done = await device.wait('audio.done')
  const pcm = Buffer.concat(device.events.filter(event => event.type === 'audio.delta').map(event => Buffer.from(event.audio, 'base64')))
  assert.equal(pcm.length, 1920)
  assert.ok(device.events.filter(event => event.type === 'audio.delta').every(event => event.sampleRate === 24000))
  assert.equal(run.deliveries.at(-1).request.text, '正确回复')
  assert.equal(run.delivered.length, 0, 'audio.done does not acknowledge speaker drain')
  device.audio()
  await settle()
  assert.equal(run.recognized.length, 1, 'capture is ignored while speaker drain is pending')
  device.send({ type: 'playback.ended', responseId: 'stale-response' })
  await settle()
  assert.equal(run.delivered.length, 0)
  device.send({ type: 'playback.ended', responseId: done.responseId })
  await device.wait('response.done', event => event.responseId === done.responseId)
  await settle()
  assert.equal(run.delivered.length, 1)
  assert.equal(run.deliveries.filter(item => item.request.text === '正确回复').length, 1)
})

test('paced device playback preserves a long reply and its partial final packet', async t => {
  const wave = pcmWave(tone(1437))
  const run = await harness(t, { synthesize: async () => wave }), device = await run.connect()
  device.audio(); await device.wait('voice.state', event => event.state === 'processing'); await settle()
  run.reply()
  const done = await device.wait('audio.done')
  const received = Buffer.concat(device.events.filter(event => event.type === 'audio.delta').map(event => Buffer.from(event.audio, 'base64')))
  assert.deepEqual(received, playbackPcm(wave, defaults.maxReplySeconds))
  device.send({ type: 'playback.ended', responseId: done.responseId })
  await device.wait('response.done')
})

test('unrelated sessions cannot trigger synthesis or explicit device delivery', async t => {
  const run = await harness(t), device = await run.connect()
  device.audio(); await device.wait('voice.state', event => event.state === 'processing'); await settle()
  const other = { header: {} }
  run.observe('turn/start', { turn: 1 }, other)
  run.observe('assistant/message', { turn: 1, message: { content: [{ type: 'text', text: 'private' }] } }, other)
  run.observe('turn/end', { turn: 1, reason: { kind: 'completed' } }, other)
  await settle()
  assert.equal(run.deliveries.length, 0)
  await assert.rejects(async () => run.bridge.adapter.check({ agent: { ...run.agent }, signal: new AbortController().signal }))
})

test('a device resumes capture after speaker drain and completes two independent voice turns', async t => {
  const run = await harness(t), device = await run.connect()
  let previousId
  for (const [index, text] of ['第一轮回复', '第二轮回复'].entries()) {
    // Firmware sends 20 ms PCM frames, followed by silence for Host segmentation.
    const pcm = Buffer.concat([tone(200), Buffer.alloc(6400)])
    for (let offset = 0; offset < pcm.length; offset += 640) device.audio(pcm.subarray(offset, offset + 640))
    const deadline = Date.now() + 3000
    while (run.submitted.length <= index && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.equal(run.submitted.length, index + 1)
    run.reply(text, index + 1)
    const done = await device.wait('audio.done', event => event.responseId !== previousId)
    device.send({ type: 'playback.started', responseId: done.responseId })
    device.send({ type: 'playback.ended', responseId: done.responseId })
    await device.wait('response.done', event => event.responseId === done.responseId)
    await settle()
    previousId = done.responseId
  }
  assert.deepEqual(run.deliveries.map(item => item.request.text), ['第一轮回复', '第二轮回复'])
  assert.equal(run.delivered.length, 2)
})

test('empty recognition, mute and protocol-only events do not submit a user message', async t => {
  let calls = 0
  const run = await harness(t, { recognition: { transcribe: async () => { calls++; return { text: '  ' } } } })
  const device = await run.connect()
  device.send({ type: 'input.mute' }); device.audio()
  device.send({ type: 'assistant/message', text: 'spoofed input' })
  device.send({ type: 'session.ping', event_id: 'ping1' })
  assert.equal((await device.wait('session.pong')).request_event_id, 'ping1')
  assert.equal(calls, 0)
  device.send({ type: 'input.unmute' }); device.audio()
  await device.wait('voice.state', event => event.state === 'processing'); await settle()
  assert.equal(calls, 1)
  assert.equal(run.submitted.length, 0)
})

test('manual interruption cancels recognition and rejects late results', async t => {
  const result = Promise.withResolvers(), started = Promise.withResolvers()
  let signal
  const run = await harness(t, { recognition: { transcribe: async (_spec, value) => { signal = value; started.resolve(); return result.promise } } })
  const device = await run.connect()
  device.audio(); await started.promise
  device.send({ type: 'response.cancel' })
  await device.wait('playback.clear')
  assert.equal(signal.aborted, true)
  result.resolve({ text: 'late user text' })
  await settle()
  assert.equal(run.submitted.length, 0)
})

test('interruption aborts synthesis and no cancelled audio reaches a device', async t => {
  const synth = Promise.withResolvers(), started = Promise.withResolvers()
  let signal
  const run = await harness(t, { synthesize: async request => { signal = request.signal; started.resolve(); return synth.promise } })
  const device = await run.connect()
  device.audio(); await device.wait('voice.state', event => event.state === 'processing'); await settle()
  run.reply(); await started.promise
  device.send({ type: 'response.cancel' }); await device.wait('playback.clear')
  assert.equal(signal.aborted, true)
  synth.resolve(pcmWave(tone(40)))
  await settle(); await settle()
  assert.equal(device.events.some(event => event.type === 'audio.delta'), false)
})

test('same-device reconnect fences old replies and does not let a stale close cancel new work', async t => {
  const run = await harness(t), old = await run.connect()
  old.audio(); await old.wait('voice.state', event => event.state === 'processing'); await settle()
  const current = await run.connect()
  assert.equal((await old.closed).code, 4001)
  assert.equal(run.cancelled, 1)
  current.audio(); await current.wait('voice.state', event => event.state === 'processing'); await settle()
  run.reply('新连接', 2)
  const done = await current.wait('audio.done')
  current.send({ type: 'playback.ended', responseId: done.responseId })
  await current.wait('response.done')
  assert.equal(run.cancelled, 1)
  assert.equal(old.events.some(event => event.type === 'audio.delta'), false)
})

test('one authenticated device cannot occupy another device lease', async t => {
  const run = await harness(t), first = await run.connect()
  const second = new Device(run.url)
  t.after(() => second.stop())
  await once(second.ws, 'open'); second.send(hello('another_device'))
  assert.equal((await second.wait('voice.ownership')).state, 'busy')
  assert.equal((await second.closed).code, 4002)
  assert.equal(first.ws.readyState, WebSocket.OPEN)
})

test('local DSH Voice Companion negotiates muted, uses its configured port and starts audio only after OK', async t => {
  const run = await harness(t)
  const device = await run.connect('bean_001122aabbcc', {
    client: { type: 'dsh-passport', version: '0.1.0', instance_id: 'bean_001122aabbcc' },
    locale: 'zh-CN', time_zone: 'Asia/Shanghai',
    connection: { voice_enabled: true, input_enabled: false, output_enabled: true, text_only: false },
  })
  const ready = await device.wait('voice.ready')
  assert.equal(ready.inputSampleRate, 16000)
  assert.equal(ready.outputSampleRate, 24000)
  device.audio()
  await settle()
  assert.equal(run.recognized.length, 0)
  device.send({ type: 'wake' })
  device.send({ type: 'input.unmute' })
  device.audio()
  await device.wait('voice.state', value => value.state === 'processing')
  await settle()
  assert.deepEqual(run.submitted, ['你好'])
  device.send({ type: 'response.cancel' })
  await device.wait('playback.clear')
  assert.equal(run.cancelled, 1)
})

test('authentication rejects missing/wrong tokens and browser origins before session creation', async t => {
  let acquired = 0
  const run = await harness(t, { session: { acquire: async () => { acquired++; throw new Error('must not run') } } })
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: `Bearer ${TOKEN}`, Origin: 'https://evil.example' }]) {
    const device = new Device(run.url, { headers })
    t.after(() => device.stop())
    const response = new Promise(resolve => device.ws.once('unexpected-response', (_request, res) => { resolve(res.statusCode); res.resume(); device.ws.terminate() }))
    assert.equal(await response, 401)
  }
  const health = run.url.replace('ws:', 'http:').replace('/api/realtime', '/api/health')
  assert.equal((await fetch(health)).status, 401)
  assert.equal((await fetch(health, { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 200)
  assert.equal(acquired, 0)
})

test('four-digit pairing authenticates a LAN device and still rejects missing, wrong and cross-origin credentials', async t => {
  const run = await harness(t, { options: { accessToken: '0042' } })
  const health = run.url.replace('ws:', 'http:').replace('/api/realtime', '/api/health')
  for (const headers of [{}, { Authorization: 'Bearer 0041' }, { Authorization: 'Bearer 0042', Origin: 'https://other.example' }]) {
    assert.equal((await fetch(health, { headers })).status, 401)
  }
  assert.equal((await fetch(health, { headers: { Authorization: 'Bearer 0042' } })).status, 200)
  const device = new Device(run.url, { headers: { Authorization: 'Bearer 0042' } })
  t.after(() => device.stop())
  await once(device.ws, 'open')
  device.send(hello())
  await device.wait('voice.ready')
  device.audio()
  await device.wait('voice.state', event => event.state === 'processing')
  await settle()
  assert.deepEqual(run.submitted, ['你好'])
})

test('malformed or oversized audio closes the connection and never reaches ASR', async t => {
  for (const audio of ['not-base64!', Buffer.alloc(1).toString('base64'), Buffer.alloc(33002).toString('base64')]) {
    const run = await harness(t), device = await run.connect()
    device.send({ type: 'input_audio_buffer.append', audio })
    assert.equal((await device.closed).code, 1008)
    assert.equal(run.recognized.length, 0)
    assert.equal(run.submitted.length, 0)
  }
})

test('provider failures stay sanitized and never fall back or forward credentials', async t => {
  const run = await harness(t, { recognition: { transcribe: async () => { throw new Error('secret-provider-key') } } })
  const device = await run.connect()
  device.audio()
  const error = await device.wait('error')
  assert.equal(error.code, 'passport-recognition-failed')
  assert.equal(JSON.stringify(device.events).includes('secret-provider-key'), false)
  assert.equal(run.submitted.length, 0)
})

test('unprepared Host ASR never creates a session or downloads a model', async t => {
  let acquired = 0
  const run = await harness(t, { recognition: { snapshot: () => ({ selection: { providerId: 'local' }, providers: [{ id: 'local', preparation: { phase: 'unprepared' } }] }) },
    session: { acquire: async () => { acquired++; throw new Error('must not run') } } })
  const device = new Device(run.url)
  t.after(() => device.stop())
  await once(device.ws, 'open'); device.send(hello())
  assert.equal((await device.wait('error')).code, 'passport-asr-unavailable')
  assert.equal((await device.closed).code, 1013)
  assert.equal(acquired, 0)
})

test('request timeout cancels work, clears device playback and discards a late transcript', async t => {
  const result = Promise.withResolvers(), started = Promise.withResolvers()
  let signal
  const run = await harness(t, { options: { requestTimeoutMs: 50 }, recognition: {
    transcribe: async (_spec, value) => { signal = value; started.resolve(); return result.promise },
  } })
  const device = await run.connect()
  device.audio(); await started.promise
  assert.equal((await device.wait('error')).code, 'passport-request-timeout')
  await device.wait('playback.clear')
  assert.equal(signal.aborted, true)
  result.resolve({ text: 'timeout result' }); await settle()
  assert.equal(run.submitted.length, 0)
})

test('playback cancellation stops subsequent audio and does not acknowledge delivery', async t => {
  const run = await harness(t, { synthesize: async () => pcmWave(tone(500)) }), device = await run.connect()
  device.audio(); await device.wait('voice.state', event => event.state === 'processing'); await settle()
  run.reply()
  const audio = await device.wait('audio.delta')
  device.send({ type: 'playback.cancelled', responseId: audio.responseId })
  await device.wait('playback.clear'); await settle()
  assert.equal(device.events.some(event => event.type === 'audio.done'), false)
  assert.equal(run.delivered.length, 0)
})

test('the optional Cordis component registers and removes its adapter and listener', async () => {
  const probe = createServer()
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const ctx = new Context(), registered = []
  ctx.provide('speechSynthesis', { registerDelivery(adapter) { registered.push(adapter); return () => registered.splice(registered.indexOf(adapter), 1) } })
  ctx.provide('speechToText', {})
  ctx.provide('agents', {})
  ctx.provide('agentPresets', {})
  ctx.provide('agentDefaultModel', {})
  const plugin = ctx.plugin(passport, { port, accessToken: TOKEN })
  const health = `http://127.0.0.1:${port}/api/health`
  try {
    for (let i = 0; i < 20; i++) {
      await settle()
      try { if ((await fetch(health, { headers: { Authorization: `Bearer ${TOKEN}` } })).ok) break } catch {}
    }
    const response = await fetch(health, { headers: { Authorization: `Bearer ${TOKEN}` } })
    assert.equal(response.status, 200)
    assert.equal(registered[0].id, 'passport')
  } finally { await plugin.dispose(); await ctx.fiber.dispose() }
  assert.equal(registered.length, 0)
  await assert.rejects(fetch(health, { headers: { Authorization: `Bearer ${TOKEN}` } }))
})

test('shutdown aborts in-flight recognition, joins work and releases the listening port', async t => {
  const started = Promise.withResolvers()
  let signal
  const run = await harness(t, { recognition: { transcribe: async (_spec, value) => {
    signal = value; started.resolve()
    await new Promise(resolve => value.addEventListener('abort', resolve, { once: true }))
    value.throwIfAborted()
  } } })
  const device = await run.connect()
  device.audio(); await started.promise
  await run.bridge.dispose()
  assert.equal(signal.aborted, true)
  assert.equal(run.bridge.address, null)
  assert.equal(run.submitted.length, 0)
})

test('segmentation handles chunk boundaries, drops silence and bounds a long recording', () => {
  const capture = new PcmUtterances(defaults)
  assert.equal(capture.append(Buffer.alloc(6400)), undefined)
  const audio = Buffer.concat([tone(), Buffer.alloc(6400)])
  let result
  for (let offset = 0; offset < audio.length; offset += 102) result = capture.append(audio.subarray(offset, offset + 102)) ?? result
  assert.ok(result)
  assert.equal(result.toString('ascii', 0, 4), 'RIFF')
  const bounded = new PcmUtterances({ ...defaults, maxRecordingSeconds: 0.5 })
  assert.throws(() => bounded.append(tone(1000)), /passport-recording-too-long/u)
  assert.equal(bounded.append(tone()), undefined, 'oversized continuation is discarded')
  bounded.append(Buffer.alloc(6400))
  assert.ok(bounded.append(Buffer.concat([tone(100), Buffer.alloc(6400)])))
})

test('playback produces supported PCM, downmixes stereo and rejects invalid formats and excess duration', () => {
  const input = tone(100), pcm = playbackPcm(pcmWave(input), 1)
  assert.equal(pcm.length, 4800)
  assert.ok(pcm.some(byte => byte !== 0))
  const stereo = Buffer.alloc(input.length * 2)
  for (let i = 0; i < input.length / 2; i++) { stereo.writeInt16LE(1000, i * 4); stereo.writeInt16LE(-1000, i * 4 + 2) }
  const wave = pcmWave(stereo)
  wave.writeUInt16LE(2, 22); wave.writeUInt32LE(64000, 28); wave.writeUInt16LE(4, 32)
  assert.ok(playbackPcm(wave, 1).every(byte => byte === 0))
  assert.throws(() => playbackPcm(pcmWave(input), 0.01), /passport-reply-too-long/u)
  assert.throws(() => playbackPcm(Buffer.from('invalid'), 1), /passport-invalid-reply-audio/u)
})

test('session identity persists per profile; corruption is not silently replaced', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-passport-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const a = new PassportSessionStore('profile-a', directory), b = new PassportSessionStore('profile-b', directory)
  const identity = { sessionId: `passport-${randomUUID()}`, preset: 'default' }
  await a.save(identity)
  assert.deepEqual(await a.load(), identity)
  assert.equal(await b.load(), undefined)
  await writeFile(a.path, '{broken')
  await assert.rejects(a.load())
  assert.equal(await readFile(a.path, 'utf8'), '{broken')
})

test('dedicated session composes the Host preset, inherits live model defaults, resumes and cleans up', async () => {
  let identity, disposed = 0, provider = 'host-provider'
  const calls = [], submitted = []
  const agent = { id: `passport-${randomUUID()}`, whenIdle: async () => {}, followup: message => submitted.push(message), cancel() {} }
  const handle = { agent, dispose: async () => { disposed++ } }
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider, model: 'host-model' }) },
    agentPresets: { resolve: async id => ({ id: id ?? 'host-default' }), acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }), mount: async (_ctx, id) => calls.push(['mount', id]) },
    agents: {
      create: async options => { calls.push(['create', options]); await options.setup({}); return handle },
      resume: async options => { calls.push(['resume', options]); await options.setup({}); return handle },
    },
  }
  const store = { load: async () => identity, save: async value => { identity = value } }
  const first = new PassportSession(ctx, '', '', store)
  assert.equal((await first.acquire()).agent, agent)
  const options = calls.find(item => item[0] === 'create')[1]
  assert.equal(options.agentOptions.provider, 'host-provider')
  provider = 'host-provider-changed'
  assert.equal(options.agentOptions.provider, 'host-provider-changed')
  first.submit('实际识别文字')
  assert.equal(submitted[0].role, 'user')
  assert.deepEqual(submitted[0].content, [{ type: 'text', text: '实际识别文字' }])
  assert.equal(calls.filter(item => item[0] === 'create').length, 1)
  await first.dispose()
  const second = new PassportSession(ctx, '', '', store)
  await second.acquire()
  assert.equal(calls.find(item => item[0] === 'resume')[1].resumeSessionId, agent.id)
  await second.dispose()
  assert.equal(disposed, 2)
})

test('a persisted session resume failure never creates a replacement conversation', async () => {
  let created = 0
  const identity = { sessionId: `passport-${randomUUID()}`, preset: 'saved-preset' }
  const ctx = {
    agentDefaultModel: {},
    agentPresets: { resolve: async id => ({ id }), acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }) },
    agents: { resume: async () => { throw new Error('writer-held') }, create: async () => { created++ } },
  }
  const session = new PassportSession(ctx, '', '', { load: async () => identity, save: async () => assert.fail('must preserve identity') })
  await assert.rejects(session.acquire(), /writer-held/u)
  assert.equal(created, 0)
  await session.dispose()
})

test('new Passport sessions create the configured workspace before Agent startup and expand the user directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'passport-workspace-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const useTilde of [false, true]) {
    const workspace = join(directory, useTilde ? 'tilde' : 'absolute', 'nested')
    const fromHome = relative(homedir(), workspace)
    const configuredPath = useTilde && !isAbsolute(fromHome) ? `~/${fromHome.replaceAll('\\', '/')}` : workspace
    let persisted
    const ctx = {
      agentDefaultModel: {},
      agentPresets: {
        resolve: async id => { assert.equal(id, 'whale-girl'); return { id } },
        acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }),
      },
      agents: { create: async options => {
        assert.equal(options.meta.cwd, workspace)
        assert.ok((await stat(workspace)).isDirectory())
        return { agent: { id: options.sessionId, whenIdle: async () => {}, cancel() {} }, dispose: async () => {} }
      } },
    }
    const session = new PassportSession(ctx, 'whale-girl', configuredPath, { load: async () => undefined, save: async value => { persisted = value } })
    await session.acquire()
    assert.equal(persisted.preset, 'whale-girl')
    await session.dispose()
  }
})

test('changing defaults preserves a saved session and does not create an unused replacement workspace', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'passport-existing-workspace-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const workspace = join(directory, 'unused'), identity = { sessionId: `passport-${randomUUID()}`, preset: 'saved-persona' }
  const ctx = {
    agentDefaultModel: {},
    agentPresets: { resolve: async id => { assert.equal(id, identity.preset); return { id } }, acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }) },
    agents: {
      create: () => assert.fail('must resume the saved identity'),
      resume: async options => {
        assert.equal(options.resumeSessionId, identity.sessionId)
        assert.equal(options.meta, undefined)
        return { agent: { whenIdle: async () => {}, cancel() {} }, dispose: async () => {} }
      },
    },
  }
  const session = new PassportSession(ctx, 'whale-girl', workspace, { load: async () => identity, save: () => assert.fail('must preserve saved identity') })
  await session.acquire()
  await assert.rejects(stat(workspace), { code: 'ENOENT' })
  await session.dispose()
})

test('an unusable workspace rejects creation without starting an Agent or overwriting the existing file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'passport-invalid-workspace-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'existing-file')
  await writeFile(path, 'keep this data')
  const ctx = {
    agentDefaultModel: {},
    agentPresets: { resolve: async id => ({ id }), acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }) },
    agents: { create: () => assert.fail('directory preparation must succeed first') },
  }
  const session = new PassportSession(ctx, 'whale-girl', path, { load: async () => undefined, save: () => assert.fail('must not save failed creation') })
  await assert.rejects(session.acquire(), error => ['EEXIST', 'ENOTDIR'].includes(error.code))
  assert.equal(await readFile(path, 'utf8'), 'keep this data')
  await session.dispose()
})

test('unload during Agent creation aborts setup and disposes a handle returned after cancellation', async () => {
  const started = Promise.withResolvers(), creation = Promise.withResolvers()
  let signal, disposed = 0
  const ctx = {
    agentDefaultModel: {},
    agentPresets: { resolve: async () => ({ id: 'default' }), acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }) },
    agents: { create: async options => { signal = options.signal; started.resolve(); return creation.promise } },
  }
  const session = new PassportSession(ctx, '', '', { load: async () => undefined, save: async () => assert.fail('must not save cancelled creation') })
  const pending = session.acquire()
  await started.promise
  const closing = session.dispose()
  assert.equal(signal.aborted, true)
  creation.resolve({ agent: { cancel() {} }, dispose: async () => { disposed++ } })
  await assert.rejects(pending)
  await closing
  assert.equal(disposed, 1)
})


test('explicit refresh starts the selected preset and commits new routing only after successful startup', async () => {
  let identity = { sessionId: `passport-${randomUUID()}`, preset: 'old-preset' }
  const old = { ...identity }, started = Promise.withResolvers(), idle = Promise.withResolvers()
  const calls = [], revision = randomUUID()
  const ctx = {
    agentDefaultModel: {},
    agentPresets: {
      resolve: async id => { calls.push(['resolve', id]); return { id } },
      acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }),
      mount: async (_ctx, id) => calls.push(['mount', id]),
    },
    agents: {
      create: async options => {
        calls.push(['create', options]); await options.setup({}); started.resolve()
        return { agent: { id: options.sessionId, whenIdle: () => idle.promise, cancel() {} }, dispose: async () => {} }
      },
      resume: () => assert.fail('refresh must not resume the previous conversation'),
    },
  }
  const store = { load: async () => identity, save: async next => { identity = next } }
  const session = new PassportSession(ctx, 'new-preset', '', store, revision)
  const opening = session.acquire()
  await started.promise
  assert.deepEqual(identity, old, 'startup has not yet committed the replacement routing')
  idle.resolve(); await opening
  assert.notEqual(identity.sessionId, old.sessionId)
  assert.equal(identity.preset, 'new-preset')
  assert.equal(identity.revision, revision)
  assert.deepEqual(calls.find(item => item[0] === 'mount'), ['mount', 'new-preset'])
  await session.dispose()
  ctx.agents.create = () => assert.fail('a repeated configuration load must resume, not create again')
  ctx.agents.resume = async options => {
    assert.equal(options.resumeSessionId, identity.sessionId)
    return { agent: { whenIdle: async () => {}, cancel() {} }, dispose: async () => {} }
  }
  const resumed = new PassportSession(ctx, 'new-preset', '', store, revision)
  await resumed.acquire(); await resumed.dispose()
})

for (const failure of ['preset', 'create', 'idle', 'save', 'cancel']) test(`failed refresh (${failure}) retains previous routing and cleans up`, async () => {
  const identity = { sessionId: `passport-${randomUUID()}`, preset: 'old-preset' }
  let saved = 0, disposed = 0
  const started = Promise.withResolvers(), idle = Promise.withResolvers()
  const ctx = {
    agentDefaultModel: {},
    agentPresets: {
      resolve: async () => { if (failure === 'preset') throw new Error('agent-preset/not-found'); return { id: 'new-preset' } },
      acquireScope: async () => ({ [Symbol.asyncDispose]: async () => {} }),
    },
    agents: {
      resume: () => assert.fail('refresh cannot resume old routing'),
      create: async options => {
        if (failure === 'create') throw new Error('create-failed')
        return { agent: { id: options.sessionId, cancel() {}, whenIdle: async () => {
          started.resolve()
          if (failure === 'cancel') await idle.promise
          if (failure === 'idle') throw new Error('idle-failed')
        } }, dispose: async () => { disposed++ } }
      },
    },
  }
  const store = { load: async () => identity, save: async () => { saved++; throw new Error('save-failed') } }
  const session = new PassportSession(ctx, 'new-preset', '', store, randomUUID())
  const opening = session.acquire()
  const rejected = assert.rejects(opening, failure === 'preset' ? /passport-preset-unavailable/u : undefined)
  if (failure === 'cancel') { await started.promise; const closing = session.dispose(); idle.resolve(); await closing }
  await rejected; await session.dispose()
  assert.equal(saved, failure === 'save' ? 1 : 0)
  assert.equal(disposed, ['idle', 'save', 'cancel'].includes(failure) ? 1 : 0)
  assert.equal(identity.preset, 'old-preset')
})

test('saved conversation refresh revisions round-trip and malformed revisions are rejected without rewriting', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'passport-revision-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new PassportSessionStore('profile-refresh', directory)
  const identity = { sessionId: `passport-${randomUUID()}`, preset: 'custom-preset', revision: randomUUID() }
  await store.save(identity)
  assert.deepEqual(await store.load(), identity)
  await writeFile(store.path, JSON.stringify({ ...identity, revision: 123 }))
  await assert.rejects(store.load(), /passport-invalid-session-state/u)
})


test('preset roster route lists actual IDs without exposing configuration and rejects mutation methods', async () => {
  const ctx = new Context(), routes = new Map()
  ctx.provide('webServer', { register: route => { routes.set(route.path, route); return () => routes.delete(route.path) } })
  ctx.provide('agentPresets', { list: async () => [
    { id: 'valid-preset', name: 'Display name', plugins: ['private-composition'] },
    { id: 'broken-preset', broken: 'private internal diagnostic' },
  ] })
  const plugin = ctx.plugin(passport, {})
  try {
    for (let n = 0; n < 20 && !routes.size; n++) await settle()
    const route = routes.get('/plugins/xiaomi-mimo-tts/passport-presets')
    assert.ok(route)
    const request = async method => {
      let status, body
      const headers = {}
      const res = { set statusCode(value) { status = value }, setHeader(key, value) { headers[key] = value }, end(value) { body = JSON.parse(value) } }
      await route.handler({ method }, res)
      return { status, body, headers }
    }
    const response = await request('GET')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.presets, [{ id: 'valid-preset', name: 'Display name', unavailable: false }, { id: 'broken-preset', unavailable: true }])
    const rejected = await request('POST')
    assert.equal(rejected.status, 405)
    assert.equal(rejected.headers.allow, 'GET')
  } finally { await plugin.dispose(); await ctx.fiber.dispose() }
  assert.equal(routes.size, 0)
})
