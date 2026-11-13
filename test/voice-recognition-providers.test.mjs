import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { apply, Config } from '../lib/index.js'
import { resolveTtsSettings } from '../lib/shared.js'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { voiceInputProvider, registerVoiceInputProviders } = await loadClientModule('src/host/voice-input-providers.ts')
const { pcmWave } = await loadClientModule('src/passport/audio.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

test('Host recognition providers deliver the same PCM to the selected Passport recognizer and clean up', async () => {
  const calls = []
  const recognition = { recognizer(source) { return {
    check() {}, create(signal, limit) {
      const item = { source, signal, limit }; calls.push(item)
      return { append(pcm) { item.pcm = Buffer.from(pcm) }, async finish() { return '识别结果' }, cancel() { item.cancelled = true } }
    },
  } } }
  const pcm = Buffer.alloc(32000, 1), wave = pcmWave(pcm)
  for (const source of ['xiaomi', 'doubao', 'doubao-nostream']) {
    const provider = voiceInputProvider(source, `test-${source}`, source, recognition)
    const result = await provider.transcribe({ audio: wave, language: 'auto' }, new AbortController().signal)
    assert.equal(result.text, '识别结果')
    assert.equal(result.audioSeconds, 1)
    assert.equal(calls.at(-1).source, source)
    assert.deepEqual(calls.at(-1).pcm, pcm)
    assert.equal(calls.at(-1).cancelled, true)
    await assert.rejects(provider.transcribe({ audio: Buffer.from('bad'), language: 'auto' }, new AbortController().signal), { message: 'passport-invalid-audio' })
  }
})

test('Host recognition masks provider errors and cancellation releases its input', async () => {
  let cancelled = false, rejectStart
  const started = new Promise(resolve => { rejectStart = resolve })
  const recognition = { recognizer() { return { check() {}, create() { return {
    append() { rejectStart() }, finish: () => new Promise(() => {}), cancel() { cancelled = true },
  } } } } }
  const provider = voiceInputProvider('xiaomi', 'test', 'test', recognition)
  const controller = new AbortController()
  const pending = provider.transcribe({ audio: pcmWave(Buffer.alloc(320)), language: 'auto' }, controller.signal)
  await started
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(cancelled, true)
  const failure = voiceInputProvider('xiaomi', 'test', 'test', { recognizer() { return { check() { throw new Error('private-key') } } } })
  await assert.rejects(failure.transcribe({ audio: pcmWave(Buffer.alloc(320)), language: 'auto' }, new AbortController().signal), { message: 'passport-recognition-failed' })
})

test('recognition service defaults on and saves independently of other settings', async () => {
  assert.equal(resolveTtsSettings().voiceRecognitionService, true)
  assert.equal(resolveTtsSettings({ voiceRecognitionService: false }).voiceRecognitionService, false)
  const user = { voiceInputCompatibility: false }
  const scope = { getSnapshot: () => ({ value: user, user }), async mutate(ops) {
    for (const op of ops) { if (op.op === 'set') user[op.path[0]] = op.value; else delete user[op.path[0]] }
    return true
  } }
  const keys = { xiaomi: '', doubao: '', breeze: '' }
  await saveSettingsDraft(scope, resolveTtsSettings({ ...user, voiceRecognitionService: false }), { voiceRecognitionService: { kind: 'set' } }, keys)
  assert.deepEqual(user, { voiceInputCompatibility: false, voiceRecognitionService: false })
  await saveSettingsDraft(scope, resolveTtsSettings(user), { voiceRecognitionService: { kind: 'clear' } }, keys)
  assert.deepEqual(user, { voiceInputCompatibility: false })
})

test('rapid service toggles wait for withdrawal and never change the Host selection', async () => {
  let enabled = false, update, cleanup, release
  const gate = new Promise(resolve => { release = resolve })
  let blockRemoval = false
  const selection = { providerId: 'xiaomi-mimo-tts-asr', language: 'auto' }
  const providers = new Map()
  const speech = { configure: () => assert.fail('plugin must not change Host selection'), register(provider) {
    assert.equal(providers.has(provider.info.id), false)
    providers.set(provider.info.id, provider)
    return async () => { providers.delete(provider.info.id); if (blockRemoval) await gate }
  } }
  const ctx = { speechToText: speech, passportRecognition: {}, logger: { error: assert.fail }, effect(register) { cleanup = register() } }
  registerVoiceInputProviders(ctx, () => enabled, listener => { update = listener; return () => { update = undefined } })
  await settle()
  assert.equal(providers.size, 0)
  enabled = true; update(); await settle()
  assert.equal(providers.size, 3)
  blockRemoval = true; enabled = false; update(); await settle()
  assert.equal(providers.size, 0)
  enabled = true; update(); await settle()
  assert.equal(providers.size, 0)
  blockRemoval = false; release(); await settle()
  assert.equal(providers.size, 3)
  assert.deepEqual(selection, { providerId: 'xiaomi-mimo-tts-asr', language: 'auto' })
  await cleanup()
  assert.equal(providers.size, 0)
  assert.equal(update, undefined)
})

test('the main plugin contributes and withdraws recognition providers with the Host service lifecycle', async () => {
  const ctx = new Context(), providers = new Map()
  ctx.provide('webServer', { register() { return () => {} }, registerUpgrade() { return () => {} } })
  ctx.provide('speechToText', {
    snapshot: () => ({ selection: { providerId: 'local', language: 'auto' }, providers: [{ id: 'local', languages: ['auto'] }] }),
    register(provider) { providers.set(provider.info.id, provider); return async () => { providers.delete(provider.info.id) } },
  })
  const fiber = ctx.plugin({ apply, Config }, {})
  try {
    for (let i = 0; i < 50 && providers.size < 3; i += 1) await settle()
    assert.deepEqual([...providers.keys()].sort(), ['xiaomi-mimo-tts-asr', 'xiaomi-mimo-tts-doubao-asr', 'xiaomi-mimo-tts-doubao-utterance-asr'])
    await fiber.dispose()
    assert.equal(providers.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('saved service toggle registers and withdraws providers without restarting the Host plugin', async () => {
  const ctx = new Context(), providers = new Map()
  ctx.provide('webServer', { register() { return () => {} }, registerUpgrade() { return () => {} } })
  ctx.provide('speechToText', { register(provider) {
    providers.set(provider.info.id, provider)
    return async () => { providers.delete(provider.info.id) }
  } })
  await ctx.plugin(Loader).await()
  ctx.loader.internal = { version: 'v2', async import() { return { apply, Config } } }
  try {
    await ctx.loader.root.update([{ id: 'test-speech', name: 'dsh-xiaomi-tts', config: { voiceRecognitionService: false } }])
    await ctx.loader.await(); await settle()
    const entry = ctx.loader.resolve('test-speech'), fiber = entry.fiber
    assert.equal(providers.size, 0)
    await entry.update({ config: { voiceRecognitionService: true } })
    await ctx.loader.await()
    for (let i = 0; i < 50 && providers.size < 3; i += 1) await settle()
    assert.equal(entry.fiber, fiber)
    assert.equal(providers.size, 3)
    await entry.update({ config: { voiceRecognitionService: false } })
    await ctx.loader.await()
    for (let i = 0; i < 50 && providers.size > 0; i += 1) await settle()
    assert.equal(entry.fiber, fiber)
    assert.equal(providers.size, 0)
  } finally { await ctx.fiber.dispose() }
})
