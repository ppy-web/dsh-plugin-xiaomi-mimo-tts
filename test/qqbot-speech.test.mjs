import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { createQqbotSpeechDelivery } from '../lib/qqbot.js'
import * as qqbotSpeech from '../lib/qqbot.js'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'

const settle = () => new Promise(resolve => setImmediate(resolve))

async function setup(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq-speech-'))
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools() {} })
  ctx.plugin(ToolsService)
  await settle()
  assert.ok(ctx.tools)
  const agent = { id: 'qq-agent' }
  const scope = createScope(ctx, agent)
  agent.ctx = scope.ctx
  const audio = { data: Buffer.from('\x02#!SILK_V3payload'), text: 'hello', format: 'silk', provider: 'xiaomi', contentType: 'audio/silk', durationMs: 100 }
  const adapter = createQqbotSpeechDelivery(ctx, directory)
  const signal = new AbortController().signal
  try { await run({ ctx, agent, audio, adapter, signal, directory }) } finally {
    await scope.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

function registerSender(ctx, execute) {
  ctx.tools.register({
    name: 'qqbot_send_file', description: 'test QQ sender',
    parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { messageId: { type: 'string' }, target: { type: 'string' } }, required: ['messageId', 'target'], additionalProperties: false }, render: () => [] },
    execute,
  })
}

test('QQ adapter passes the real Agent through the shared pipeline and cleans audio after the sender settles', async () => {
  await setup(async ({ ctx, agent, audio, adapter, signal, directory }) => {
    let sentPath
    registerSender(ctx, async (args, exec) => {
      assert.equal(exec.agent, agent)
      assert.deepEqual(Object.keys(args), ['file_path'])
      sentPath = args.file_path
      assert.deepEqual(await readFile(sentPath), audio.data)
      return { messageId: 'qq-message', target: 'c2c:current-peer' }
    })
    const results = []
    agent.ctx.on('tools/result', (exec, result) => { results.push({ exec, result }) })
    assert.deepEqual(await adapter.send(audio, { agent, signal }), { adapter: 'qqbot', messageId: 'qq-message', target: 'c2c:current-peer' })
    assert.equal(results.length, 1, 'delivery participates in normal tool policies and result observation')
    assert.equal(results[0].exec.name, 'qqbot_send_file')
    assert.equal(results[0].result.isError, false)
    await assert.rejects(readFile(sentPath), { code: 'ENOENT' })
    assert.deepEqual(await readdir(directory), [])
  })
})

test('scoped policies can block QQ delivery; failure cleans temporary files without retrying', async () => {
  await setup(async ({ ctx, agent, audio, adapter, signal, directory }) => {
    let calls = 0
    registerSender(ctx, async () => { calls++; return { messageId: 'should-not-send', target: 'group:peer' } })
    agent.ctx.inject(['tools'], scoped => { scoped.tools.guard(() => 'denied by conversation policy') })
    await settle()
    await assert.rejects(adapter.send(audio, { agent, signal }), error => error.code === 'qqbot-send-failed')
    assert.equal(calls, 0)
    assert.deepEqual(await readdir(directory), [])
  })
  await setup(async ({ ctx, agent, audio, adapter, signal, directory }) => {
    let calls = 0
    registerSender(ctx, async () => { calls++; throw new Error('network result unknown') })
    await assert.rejects(adapter.send(audio, { agent, signal }), error => error.code === 'qqbot-send-failed')
    assert.equal(calls, 1)
    assert.deepEqual(await readdir(directory), [])
  })
})

test('missing, restricted or canceled QQ senders never produce a delivery', async () => {
  await setup(async ({ ctx, agent, audio, adapter, signal, directory }) => {
    await assert.rejects(adapter.send(audio, { agent, signal }), error => error.code === 'qqbot-send-tool-unavailable')
    registerSender(ctx, async () => assert.fail('must not send'))
    agent.ctx.inject(['tools'], scoped => { scoped.tools.restrict({ deny: ['qqbot_send_file'] }) })
    await settle()
    await assert.rejects(adapter.send(audio, { agent, signal }), error => error.code === 'qqbot-send-tool-unavailable')
    const controller = new AbortController(); controller.abort()
    await assert.rejects(adapter.send(audio, { agent, signal: controller.signal }))
    assert.deepEqual(await readdir(directory), [])
  })
})

test('one QQ component owns both its delivery adapter and built-in preset, and removes both on unload', async () => {
  const ctx = new Context(), presets = new Map(), adapters = new Map()
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('speechSynthesis', { registerDelivery(adapter) { adapters.set(adapter.id, adapter); return () => adapters.delete(adapter.id) } })
  ctx.provide('agentPresets', { async register(preset) { presets.set(preset.id, preset); return () => presets.delete(preset.id) } })
  ctx.plugin(ToolsService)
  await settle()
  const plugin = ctx.plugin(qqbotSpeech)
  try {
    await settle()
    assert.ok(adapters.has('qqbot'))
    const preset = presets.get('qq-speech-assistant')
    const speech = preset.plugins.find(row => row.name === 'dsh-xiaomi-tts/speech-agent')
    assert.equal(speech.config.delivery, 'qqbot')
    assert.ok(preset.plugins.some(row => row.name === 'dsh-xiaomi-tts/qqbot-agent'))
    const persona = preset.plugins.find(row => row.name === '@deepseek-ai/dsh-persona')
    assert.equal(typeof persona.config.prefix, 'string')
    assert.ok(persona.config.prefix.length > 0)
    await plugin.dispose()
    assert.equal(presets.size, 0)
    assert.equal(adapters.size, 0)
    // The installable bundle contributes one opt-in speech integration component.
    const schema = yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value })])
    const patch = yaml.load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), { schema })
    const entries = patch.flatMap(row => row.insert ?? [])
    const speechEntries = entries.filter(entry => entry.name === 'dsh-xiaomi-tts/qqbot' || entry.name === 'dsh-xiaomi-tts/speech-preset')
    assert.deepEqual(speechEntries.map(entry => [entry.name, entry.disabled]), [['dsh-xiaomi-tts/qqbot', true]])
  } finally { await ctx.fiber.dispose() }
})
