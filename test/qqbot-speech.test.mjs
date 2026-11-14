import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Sessions from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Agents, { agentEvents } from '@deepseek-ai/dsh-agent'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { createQqbotSpeechDelivery } from '../lib/qqbot.js'
import * as qqbotSpeech from '../lib/qqbot.js'
import * as speechAgent from '../lib/speech-agent.js'
import * as whaleAgent from '../lib/whale-agent.js'
import { randomUUID } from 'node:crypto'
import { loadClientModule } from './helpers/client-modules.mjs'
import { readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'

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

function registerSender(ctx, execute, options) {
  ctx.tools.register({
    name: 'qqbot_send_file', description: 'test QQ sender',
    parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { messageId: { type: 'string' }, target: { type: 'string' } }, required: ['messageId', 'target'], additionalProperties: false }, render: () => [] },
    execute,
  }, options)
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

test('a step-conditional QQ sender stays usable for out-of-band deliveries', async () => {
  await setup(async ({ ctx, agent, audio, adapter, signal }) => {
    registerSender(ctx, async () => ({ messageId: 'conditional', target: 'group:peer' }), { when: () => true })
    await settle()
    assert.deepEqual(await adapter.send(audio, { agent, signal }), { adapter: 'qqbot', messageId: 'conditional', target: 'group:peer' })
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

test('QQ relay owns its adapter and separate preset and withdraws both on unload', async () => {
  const ctx = new Context(), adapters = new Map(), presets = new Map()
  ctx.provide('agentPresets', { async register(config) { presets.set(config.id, config); return () => presets.delete(config.id) } })
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('speechSynthesis', { registerDelivery(adapter) { adapters.set(adapter.id, adapter); return () => adapters.delete(adapter.id) } })
  ctx.plugin(ToolsService)
  await settle()
  const plugin = ctx.plugin(qqbotSpeech)
  try {
    await plugin.await()
    assert.ok(adapters.has('qqbot'))
    const preset = presets.get('qq-speech-assistant')
    assert.ok(preset)
    assert.equal(preset.plugins.find(row => row.name === 'dsh-xiaomi-tts/speech-agent').config.delivery, 'qqbot')
    assert.ok(ctx.qqbotSettings.current().persona.name)
    await plugin.dispose()
    assert.equal(adapters.size, 0)
    assert.equal(presets.size, 0)
    const schema = new yaml.Schema([...yaml.JSON_SCHEMA.tags, yaml.defineScalarTag('tag:yaml.org,2002:js', { resolve: value => value })])
    const patch = yaml.load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), { schema })
    const entries = patch.flatMap(row => row.insert ?? [])
    assert.deepEqual(entries.filter(entry => entry.name === 'dsh-xiaomi-tts/qqbot').map(entry => entry.disabled), [true])
  } finally { await ctx.fiber.dispose() }
})

test('the Host advertises QQ voice capabilities for the lifetime of the relay', async () => {
  const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
  const ctx = new Context(), speech = new HostSpeechService(() => ({ acceptExternalProviders: true }))
  ctx.provide('agentPresets', { async register() { return () => {} } })
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('speechSynthesis', speech)
  try {
    await ctx.plugin(ToolsService).await()
    assert.equal(speech.conversationDelivery('qqbot'), undefined)
    const relay = ctx.plugin(qqbotSpeech)
    await relay.await()
    assert.equal(speech.conversationDelivery('qqbot')?.format, 'silk')
    assert.equal(speech.conversationDelivery('qqbot')?.automatic, false)
    speech.setAutomaticDeliveryEnabled('qqbot', true)
    assert.equal(speech.conversationDelivery('qqbot')?.automatic, true)
    speech.setDeliveryEnabled('qqbot', false)
    assert.equal(speech.conversationDelivery('qqbot'), undefined)
    speech.setDeliveryEnabled('qqbot', true)
    await relay.dispose()
    assert.equal(speech.conversationDelivery('qqbot'), undefined)
  } finally {
    await ctx.fiber.dispose()
    await speech.dispose()
  }
})

test('QQ speech follows an existing preset, preserves desktop delivery and rejects stale QQ routes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq-bridge-'))
  const mapping = join(directory, 'model-prefs.json')
  const ctx = new Context(), sends = [], deliveries = [], scopes = []
  const failure = Promise.withResolvers()
  let adapter, automatic = true, duringSynthesis
  ctx.provide('systemPrompt', { tools() {}, section() {}, context() {} })
  ctx.provide('whaleSettings', { current: () => ({ persona: qqbotSpeech.DEFAULT_WHALE_PERSONA, memory: { enabled: false } }) })
  ctx.provide('speechSynthesis', {
    registerDelivery(value) {
      // Keep the actual QQ adapter and sender pipeline with an isolated media directory.
      adapter = { ...createQqbotSpeechDelivery(ctx, directory), conversation: value.conversation }
      return () => { adapter = undefined }
    },
    conversationDelivery: id => id === 'qqbot' && adapter ? { format: adapter.format, automatic, policy: adapter.conversation } : undefined,
    hasDelivery: id => id === 'file' || (id === 'qqbot' && !!adapter),
    isAutomaticDeliveryEnabled: id => id === 'qqbot' && automatic,
    async deliver(request, id, context) {
      if (id === 'file') return { adapter: 'file', path: '/fixture.wav' }
      await context.validateRoute?.(context.signal)
      await adapter.check(context)
      await duringSynthesis?.()
      return adapter.send({ data: Buffer.from(request.text), contentType: 'audio/silk', format: 'silk' }, context)
    },
  })
  try {
    await ctx.plugin(Loader).await()
    await ctx.plugin(Sessions).await()
    await ctx.plugin(Projections).await()
    await ctx.plugin(Agents).await()
    await ctx.plugin(ToolsService).await()
    await ctx.plugin(Presets, { default: 'existing' }).await()
    ctx.loader.internal = { version: 'v2', async import(name) {
      if (name === 'dsh-xiaomi-tts/speech-agent') return speechAgent
      if (name === 'dsh-xiaomi-tts/whale-agent') return whaleAgent
      if (name === 'dsh-xiaomi-tts/qqbot-agent') return await import('../lib/qqbot-agent.js')
      if (name === '@deepseek-ai/dsh-time-context') return { apply() {} }
      throw new Error(name)
    } }
    await ctx.agentPresets.register({ id: 'existing', plugins: [] })
    await ctx.agentPresets.register({ id: 'shared-whale', plugins: [
      { id: 'persona', name: 'dsh-xiaomi-tts/whale-agent' },
      { id: 'speech', name: 'dsh-xiaomi-tts/speech-agent', config: { delivery: 'file', defaultMode: 'auto' } },
    ] })
    await ctx.agentPresets.register({ id: 'legacy-qq', plugins: [
      { id: 'speech', name: 'dsh-xiaomi-tts/speech-agent', config: { delivery: 'qqbot' } },
    ] })
    const plugin = ctx.plugin(qqbotSpeech)
    await plugin.await()
    ctx.qqbotCompanion.identity.path = mapping
    registerSender(ctx, async (args, { agent }) => {
      assert.deepEqual(Object.keys(args), ['file_path'])
      sends.push({ agent, text: await readFile(args.file_path, 'utf8') })
      return { messageId: 'audio', target: 'group:current' }
    })
    ctx.on('speech/delivered', event => { deliveries.push(event) })
    ctx.on('speech/failed', event => { failure.resolve(event) })
    const make = async (preset, meta = {}) => {
      const agent = { id: randomUUID() }
      const scope = createScope(ctx, agent)
      scopes.push(scope)
      agent.ctx = scope.ctx
      await scope.ctx.plugin({ inject: ['sessions'], apply(owner) {
        agent.session = owner.sessions.create(agent.id, { meta: { agentPreset: preset, ...meta } })
      } }).await()
      await ctx.agentPresets.mount(scope.ctx, preset)
      await scope.ctx.plugin({ inject: ['agents'], async apply(owner) { await owner.agents.register(agent) } }).await()
      return agent
    }
    const qq = await make('existing'), whale = await make('shared-whale'), legacy = await make('legacy-qq'), builtIn = await make('qq-speech-assistant')
    const desktop = await make('existing'), child = await make('existing', { origin: 'subagent', parentSession: qq.id })
    const peers = { 'qqbot:bot:group:room': qq.id, 'qqbot:bot:c2c:whale': whale.id, 'qqbot:bot:c2c:legacy': legacy.id, 'qqbot:bot:c2c:child': child.id, 'qqbot:bot:c2c:builtin': builtIn.id }
    const map = (rows = peers) => writeFile(mapping, JSON.stringify({ sessionIds: rows }))
    await map()
    const pipeline = new ToolExecutionPipeline(ctx)
    const turns = new WeakMap()
    const start = async (agent, source = { kind: 'user' }) => {
      const turn = (turns.get(agent) ?? 0) + 1
      turns.set(agent, turn)
      const signal = new AbortController().signal
      const modelSelection = { provider: 'test', model: 'test' }
      const message = createUserMessage({ content: [{ type: 'text', text: '你好' }], source })
      agent.session.append('turn/start', { turn })
      const events = agentEvents(ctx, agent)
      events.emit('agent/inbox/claimed', { turn, message })
      const toolSet = await ctx.tools.resolve({ agent, modelSelection, signal })
      await events.waterfall('agent/pre-step', { turn, step: 1, messages: [message], signal, modelSelection }, async () => ({ kind: 'enter', messages: [message] }))
      return {
        toolSet,
        async speak(text) {
          const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'speak', arguments: { text }, agent, signal, toolSet })
          return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
        },
        finish(text, kind = 'completed') {
          toolSet.dispose()
          agent.session.append('assistant/message', { turn, step: 1, stream: [],
            message: { id: randomUUID(), role: 'assistant', source: { kind: 'model', ...modelSelection }, content: [{ type: 'text', text }] },
          }, { surfaceOp: 'append' })
          agent.session.append('turn/end', { turn, reason: kind === 'completed' ? { kind } : { kind, cause: { kind: 'user' } } })
        },
      }
    }
    const delivered = async count => {
      for (let tries = 0; deliveries.length < count && tries < 150; tries++) await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(deliveries.length, count)
    }
    let turn = await start(qq)
    assert.ok(ctx.tools.get('speak', qq, turn.toolSet))
    turn.finish('普通预设自动传声')
    await delivered(1)
    assert.deepEqual(sends, [{ agent: qq, text: '普通预设自动传声' }])
    turn = await start(whale)
    assert.equal((await turn.speak('桌面预设的 QQ 语音')).value.adapter, 'qqbot')
    turn.finish('避免同轮重复发送')
    await delivered(2)
    turn = await start(legacy)
    turn.finish('已有 QQ 交付配置')
    await delivered(3)
    assert.equal(sends[2].text, '已有 QQ 交付配置')
    turn = await start(builtIn)
    turn.finish('内置预设也只发送一次')
    await delivered(4)
    assert.deepEqual(sends[3], { agent: builtIn, text: '内置预设也只发送一次' })

    turn = await start(whale, { kind: 'user', rpcId: randomUUID() })
    assert.equal((await turn.speak('从 DSH 打开同一会话')).value.adapter, 'file')
    turn.finish('桌面本地交付')
    await delivered(5)
    for (const agent of [desktop, child]) {
      turn = await start(agent)
      assert.equal(ctx.tools.get('speak', agent, turn.toolSet), undefined)
      turn.finish('不发送到 QQ')
    }
    turn = await start(qq, { kind: 'user', rpcId: randomUUID() })
    assert.equal(ctx.tools.get('speak', qq, turn.toolSet), undefined)
    turn.finish('桌面回复')
    await settle()
    assert.equal(sends.length, 4)

    automatic = false
    turn = await start(qq)
    assert.equal((await turn.speak('按需发送')).value.adapter, 'qqbot')
    turn.finish('普通文字')
    await delivered(6)
    turn = await start(qq)
    duringSynthesis = () => map({ ...peers, 'qqbot:bot:group:room': 'new-session' })
    assert.equal((await turn.speak('已换会话')).isError, true)
    assert.equal((await failure.promise).code, 'qqbot-identity-unavailable')
    duringSynthesis = undefined
    turn.finish('保留文字回复')
    assert.equal(sends.length, 5)
    assert.deepEqual(await readdir(directory), ['model-prefs.json'])
    await plugin.dispose()
    assert.equal(ctx.speechSynthesis.conversationDelivery('qqbot'), undefined)
    assert.equal(ctx.tools.get('speak', qq), undefined)
  } finally {
    for (const scope of scopes) await scope.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
