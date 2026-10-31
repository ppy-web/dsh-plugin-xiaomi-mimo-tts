import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createScope } from '@deepseek-ai/dsh-scope'
import { QqCompanion, QqIdentityReader, QqMemoryStore, DEFAULT_WHALE_PERSONA } from '../lib/qqbot.js'
import * as whaleAgent from '../lib/whale-agent.js'
import { WhaleConversations } from '../lib/whale-agent.js'

const signal = () => new AbortController().signal
const baseTime = Date.UTC(2026, 9, 31, 4) // noon in Beijing
const day = 86400000
const settle = () => new Promise(resolve => setImmediate(resolve))
const defaults = () => ({
  persona: { ...DEFAULT_WHALE_PERSONA }, memory: { enabled: true },
})
const agent = (id = randomUUID()) => ({ id, session: { header: { origin: undefined, agentPreset: 'whale-girl' } }, status: 'idle', followup: () => assert.fail('the plugin must not drive a conversation') })

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'qq-companion-'))
  const mapping = join(directory, 'model-prefs.json')
  let now = baseTime
  const current = defaults(), instances = []
  const store = new QqMemoryStore('profile-one:qq-component', directory)
  const identity = new QqIdentityReader(mapping)
  const create = () => {
    const companion = new QqCompanion(store, identity, () => current, () => now)
    instances.push(companion)
    return companion
  }
  const companion = create(), peer = agent('session-private')
  const key = 'qqbot:bot-one:c2c:user-one'
  const map = async (entries = { [key]: peer.id }) => writeFile(mapping, JSON.stringify({ sessionIds: entries }))
  await map()
  const ready = async () => companion.prepare(peer)
  try {
    await run({ directory, mapping, store, identity, companion, current, peer, key, create, map, ready,
      now: () => now, time: value => { now = value } })
  } finally {
    await Promise.all(instances.map(instance => instance.dispose()))
    await rm(directory, { recursive: true, force: true })
  }
}

test('identity mapping is structural, read-only and rejects missing, malformed or ambiguous peers', async () => {
  await fixture(async ({ identity, mapping, map, peer, key }) => {
    const bytes = await readFile(mapping)
    assert.deepEqual(await identity.resolve(peer.id), { key, appId: 'bot-one', scope: 'c2c', peerId: 'user-one' })
    assert.deepEqual(await readFile(mapping), bytes)
    await assert.rejects(identity.resolve('not-a-QQ-session'), { code: 'qqbot-identity-unavailable' })
    await map({ [key]: peer.id, 'qqbot:bot-two:group:another-peer': peer.id })
    await assert.rejects(identity.resolve(peer.id), { code: 'qqbot-identity-unavailable' })
    await writeFile(mapping, '{broken')
    await assert.rejects(identity.resolve(peer.id), { code: 'qqbot-identity-unavailable' })
    await rm(mapping)
    await assert.rejects(identity.resolve(peer.id), { code: 'qqbot-identity-unavailable' })
  })
})

test('memory is isolated by profile, bot and peer, survives /new, and does not share a fallback identity', async () => {
  await fixture(async ({ store, directory, companion, peer, key, map }) => {
    await companion.prepare(peer)
    const saved = await companion.memory(peer, { action: 'save', kind: 'preference', text: '称呼我小林' }, signal())
    const next = agent('session-after-new')
    await map({ [key]: next.id, 'qqbot:bot-one:group:group-one': 'session-group', 'qqbot:bot-two:c2c:user-one': 'session-other-bot' })
    await companion.prepare(next)
    assert.equal((await companion.memory(next, { action: 'list' }, signal())).entries[0].id, saved.id)
    assert.equal((await companion.memory(agent('session-group'), { action: 'list' }, signal())).entries.length, 0)
    assert.equal((await companion.memory(agent('session-other-bot'), { action: 'list' }, signal())).entries.length, 0)
    assert.equal((await new QqMemoryStore('another-profile', directory).load(key)).entries.length, 0)
    assert.equal((await store.load(key)).entries[0].text, '称呼我小林')
    await assert.rejects(companion.memory(agent('missing'), { action: 'save', kind: 'preference', text: 'not shared' }, signal()), { code: 'qqbot-identity-unavailable' })
  })
})

test('memory update, forget, clear and pause persist without inventing a successful write', async () => {
  await fixture(async ({ companion, peer, store, key }) => {
    await companion.prepare(peer)
    const saved = await companion.memory(peer, { action: 'save', kind: 'requirement', text: '少用表情' }, signal())
    await companion.memory(peer, { action: 'save', id: saved.id, kind: 'requirement', text: '不要表情' }, signal())
    assert.equal((await store.load(key)).entries.length, 1)
    assert.ok(companion.context(peer).includes('不要表情'))
    await companion.memory(peer, { action: 'pause' }, signal())
    assert.ok(!companion.context(peer).includes('不要表情'))
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'preference', text: '不会保存' }, signal()), { code: 'qqbot-memory-paused' })
    await companion.memory(peer, { action: 'resume' }, signal())
    await companion.memory(peer, { action: 'forget', id: saved.id }, signal())
    assert.ok(!companion.context(peer).includes('不要表情'))
    await companion.memory(peer, { action: 'save', kind: 'topic', text: '近况' }, signal())
    await companion.memory(peer, { action: 'clear' }, signal())
    assert.equal((await store.load(key)).topics.length, 0)
    const before = await readFile(store.path(key))
    await assert.rejects(store.update(key, state => { state.entries = []; throw new Error('disk operation aborted') }))
    assert.deepEqual(await readFile(store.path(key)), before)
    await writeFile(store.path(key), '{broken')
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'preference', text: 'cannot overwrite corrupt memory' }, signal()), { code: 'qqbot-memory-corrupt' })
    assert.equal(await readFile(store.path(key), 'utf8'), '{broken')
  })
})

test('memory limits, topic expiry and concurrent stores protect saved records', async () => {
  await fixture(async ({ companion, peer, store, directory, key }) => {
    await companion.prepare(peer)
    const secondStore = new QqMemoryStore('profile-one:qq-component', directory)
    await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? store : secondStore).update(key, state => {
      state.entries.push({ id: String(index), kind: 'preference', text: `偏好 ${index}`, updatedAt: baseTime })
    })))
    assert.equal((await store.load(key)).entries.length, 12)
    for (let index = 12; index < 32; index++) await companion.memory(peer, { action: 'save', kind: 'preference', text: `偏好 ${index}` }, signal())
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'preference', text: '超过上限' }, signal()), { code: 'qqbot-memory-full' })
    const entries = (await companion.memory(peer, { action: 'list' }, signal())).entries
    for (const entry of entries) await companion.memory(peer, { action: 'save', id: entry.id, kind: 'preference', text: `偏好 ${entry.id} ${'长内容'.repeat(70)}` }, signal())
    await companion.memory(peer, { action: 'save', id: entries[0].id, kind: 'requirement', text: '优先保留的重要要求' }, signal())
    assert.ok(companion.context(peer).includes('优先保留的重要要求'))
    assert.ok(companion.context(peer).length < 6500, 'bounded context must retain the user requirements')
    for (let index = 0; index < 8; index++) await companion.memory(peer, { action: 'save', kind: 'topic', text: `话题 ${index}` }, signal())
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'topic', text: '第九个' }, signal()), { code: 'qqbot-memory-full' })
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'topic', text: '非法过期', expiresInDays: 31 }, signal()), { code: 'qqbot-topic-expiry-invalid' })
    assert.ok((await readdir(store.directory)).every(file => file.endsWith('.json')))
  })
})

test('earlier memory files keep preferences and topics across restart and subsequent writes', async () => {
  await fixture(async ({ companion, create, peer, store, key, directory }) => {
    await mkdir(store.directory, { recursive: true })
    const entry = { id: 'old-preference', kind: 'preference', text: '请叫我小林', updatedAt: baseTime }
    const topic = { id: 'old-topic', title: '吉他练习', updatedAt: baseTime, expiresAt: baseTime + day }
    await writeFile(store.path(key), JSON.stringify({
      version: 1, key, memoryEnabled: true, entries: [entry], topics: [{ ...topic, proactive: true, usedAt: baseTime }],
      sessionId: peer.id, lastInputId: 'previous-input', lastActivityAt: baseTime, epoch: 'previous-epoch',
      proactive: { enabled: true, paused: false, grant: '', attemptedEpoch: '', day: '', count: 0 },
    }))
    await companion.prepare(peer)
    assert.ok(companion.context(peer).includes(entry.text))
    assert.ok(companion.context(peer).includes(topic.title))
    await companion.dispose()
    const restarted = create()
    const saved = await restarted.memory(peer, { action: 'list' }, signal())
    assert.deepEqual(saved.entries, [entry])
    assert.deepEqual(saved.topics, [topic])
    await restarted.memory(peer, { action: 'save', kind: 'requirement', text: '回答简短一点' }, signal())
    const restored = await new QqMemoryStore('profile-one:qq-component', directory).load(key)
    assert.equal(restored.entries[0].text, entry.text)
    assert.equal(restored.entries[1].text, '回答简短一点')
    assert.equal(restored.topics[0].title, topic.title)
  })
})

test('expired topics leave normal conversation context and free capacity for a new topic', async () => {
  await fixture(async ({ companion, peer, time, store, key }) => {
    for (let index = 0; index < 8; index++) await companion.memory(peer, { action: 'save', kind: 'topic', text: `旧话题 ${index}`, expiresInDays: 1 }, signal())
    assert.ok(companion.context(peer).includes('旧话题 0'))
    time(baseTime + 2 * day)
    assert.ok(!companion.context(peer).includes('旧话题'))
    await companion.memory(peer, { action: 'save', kind: 'topic', text: '新话题' }, signal())
    assert.deepEqual((await store.load(key)).topics.map(topic => topic.title), ['新话题'])
  })
})

test('failed or canceled memory writes never appear as saved context', async () => {
  await fixture(async ({ companion, peer, store, key }) => {
    await companion.memory(peer, { action: 'save', kind: 'preference', text: '已有偏好' }, signal())
    const before = await readFile(store.path(key)), update = store.update.bind(store)
    store.update = async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) }
    await assert.rejects(companion.memory(peer, { action: 'save', kind: 'preference', text: '未写入内容' }, signal()), { code: 'ENOSPC' })
    assert.ok(!companion.context(peer).includes('未写入内容'))
    store.update = update
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(companion.memory(peer, { action: 'clear' }, controller.signal))
    assert.deepEqual(await readFile(store.path(key)), before)
  })
})

test('the persona reads live fields and scoped memory tools cannot target another QQ conversation', async () => {
  await fixture(async ({ companion, current, peer, ready, identity }) => {
    const require = createRequire(import.meta.url)
    const modulePath = require.resolve('@deepseek-ai/dsh-system-prompt', { paths: [dirname(require.resolve('@deepseek-ai/dsh-agent'))] })
    const { default: SystemPrompt } = await import(pathToFileURL(modulePath).href)
    const ctx = new Context()
    ctx.plugin(SystemPrompt, { includeHarnessIdentity: false })
    ctx.plugin(ToolsService)
    ctx.provide('qqbotCompanion', companion)
    ctx.provide('whaleSettings', { current: () => current })
    ctx.provide('whaleConversations', new WhaleConversations(identity, () => true))
    ctx.provide('llm', { prepareCall: () => assert.fail('memory tools do not request a model') })
    await settle()
    ctx.tools.setExecutor({
      describe: tools => ({ schemas: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }),
      execute: () => assert.fail('the test invokes memory through the policy pipeline, not a model loop'),
    })
    const scope = createScope(ctx, peer)
    peer.ctx = scope.ctx
    const tools = scope.ctx.plugin(whaleAgent)
    await tools.await()
    try {
      await ready()
      await ctx.whaleConversations.resolve(peer)
      current.persona.name = '自定义角色甲'
      current.persona.likes = '自定义喜好乙'
      const first = await ctx.systemPrompt.assemble({ scope: peer, agent: peer })
      assert.ok(first.sections.some(section => section.text.includes('自定义角色甲') && section.text.includes('自定义喜好乙')))
      current.persona.name = '新的角色名丙'
      const next = await ctx.systemPrompt.assemble({ scope: peer, agent: peer })
      assert.ok(next.sections.some(section => section.text.includes('新的角色名丙')))
      assert.equal(ctx.tools.executable('qqbot_memory'), undefined)
      const pipeline = new ToolExecutionPipeline(ctx)
      const invoke = async args => {
        const toolSet = await ctx.tools.resolve({ agent: peer, modelSelection: {}, signal: signal() })
        try {
          const prepared = await pipeline.prepare({ name: 'qqbot_memory', callId: randomUUID(), arguments: args, agent: peer, signal: signal(), toolSet })
          return await pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
        } finally { toolSet.dispose() }
      }
      const saved = await invoke({ action: 'save', kind: 'preference', text: '测试称呼' })
      assert.equal(saved.isError, false)
      assert.equal((await invoke({ action: 'save', kind: 'preference', text: '非法跨群', target: 'group:other' })).isError, true)
      assert.equal((await invoke({ action: 'save', kind: 'preference', text: '非法路径', path: '../outside' })).isError, true)
      const assembly = await ctx.systemPrompt.assemble({ scope: peer, agent: peer })
      assert.ok(assembly.contexts.some(context => context.text.includes('测试称呼')))
      ctx.tools.register({
        name: 'local_file_read', description: 'test desktop file tool', parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: { schema: { type: 'object', properties: {}, additionalProperties: false }, render: () => [] },
        async execute() { return {} },
      })
      const qqLocal = await pipeline.prepare({ name: 'local_file_read', callId: randomUUID(), arguments: {}, agent: peer, signal: signal() })
      assert.equal((await pipeline.complete(qqLocal.exec, qqLocal.kind === 'dispatch' ? await pipeline.dispatch(qqLocal.exec) : qqLocal)).isError, true, 'QQ must not gain desktop filesystem access from the shared preset')
      const desktop = agent('desktop-whale'), desktopScope = createScope(ctx, desktop)
      desktop.ctx = desktopScope.ctx
      try {
        await desktopScope.ctx.plugin(whaleAgent).await()
        await ctx.whaleConversations.resolve(desktop)
        const desktopPrompt = await ctx.systemPrompt.assemble({ scope: desktop, agent: desktop })
        assert.ok(desktopPrompt.sections.some(section => section.text.includes('新的角色名丙')))
        assert.ok(desktopPrompt.contexts.every(context => !context.text.includes('测试称呼')), 'DSH must not receive QQ private memory')
        const desktopLocal = await pipeline.prepare({ name: 'local_file_read', callId: randomUUID(), arguments: {}, agent: desktop, signal: signal() })
        assert.equal((await pipeline.complete(desktopLocal.exec, desktopLocal.kind === 'dispatch' ? await pipeline.dispatch(desktopLocal.exec) : desktopLocal)).isError, false)
        const desktopTools = await ctx.tools.resolve({ agent: desktop, modelSelection: {}, signal: signal() })
        try { assert.equal(ctx.tools.executable('qqbot_memory', desktop, desktopTools), undefined) }
        finally { desktopTools.dispose() }
      } finally { await desktopScope.dispose() }
    } finally { await scope.dispose(); await ctx.fiber.dispose() }
  })
})
