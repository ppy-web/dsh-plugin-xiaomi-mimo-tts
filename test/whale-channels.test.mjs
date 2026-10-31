import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { WhaleConversations } from '../lib/whale-agent.js'
import { QqIdentityReader } from '../lib/qqbot.js'
import * as speechAgent from '../lib/speech-agent.js'

const signal = () => new AbortController().signal
const settle = () => new Promise(resolve => setImmediate(resolve))
const agent = () => ({ id: randomUUID(), session: { header: { agentPreset: 'whale-girl' } } })

test('session mapping distinguishes DSH and QQ under the same preset and fails closed on unavailable identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whale-channels-'))
  const path = join(directory, 'mapping.json'), desktop = agent(), qq = agent(), group = agent()
  const reader = new QqIdentityReader(path), routes = new WhaleConversations(reader, () => true)
  try {
    const mapping = { 'qqbot:bot:c2c:peer': qq.id, 'qqbot:bot:group:room': group.id }
    await writeFile(path, JSON.stringify({ sessionIds: mapping }))
    assert.equal((await routes.resolve(desktop)).kind, 'dsh')
    assert.equal((await routes.resolve(qq)).identity.scope, 'c2c')
    assert.equal((await routes.resolve(group)).identity.scope, 'group')
    await writeFile(path, JSON.stringify({ sessionIds: { ...mapping, 'qqbot:other:c2c:peer': qq.id } }))
    assert.equal((await routes.resolve(qq)).kind, 'unknown')
    await writeFile(path, '{broken')
    assert.equal((await routes.resolve(desktop)).kind, 'unknown')
    await rm(path)
    assert.equal((await routes.resolve(qq)).kind, 'unknown')
    assert.equal((await new WhaleConversations(reader, () => false).resolve(desktop)).kind, 'dsh')
    desktop.session.header.origin = 'subagent'
    assert.equal((await routes.resolve(desktop)).kind, 'unknown')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('one speech module routes explicit voice by verified channel, preserves first-turn QQ auto voice and blocks unknown channels', { timeout: 5000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whale-speech-routing-'))
  const path = join(directory, 'mapping.json'), desktop = agent(), qq = agent(), sends = []
  await writeFile(path, JSON.stringify({ sessionIds: { 'qqbot:bot:c2c:peer': qq.id } }))
  const ctx = new Context(), agents = new Map([[desktop.id, desktop], [qq.id, qq]])
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('agents', { get: id => agents.get(id) })
  ctx.provide('whaleConversations', new WhaleConversations(new QqIdentityReader(path), () => true))
  ctx.provide('qqbotSpeechRules', { current: () => ({ maxAutoCharacters: 0, maxDurationMs: 25000 }) })
  ctx.provide('llm', { prepareCall: () => assert.fail('routing must not call a model') })
  ctx.provide('speechSynthesis', {
    hasDelivery: () => true, isAutomaticDeliveryEnabled: id => id === 'qqbot',
    async deliver(request, adapter, context) { sends.push({ request, adapter, context }); return { adapter } },
  })
  ctx.plugin(ToolsService)
  await settle()
  const key = {}, preset = createScope(ctx, key)
  const scopes = [desktop, qq].map(owner => { const scope = createScope(ctx, owner, { parent: key }); owner.ctx = scope.ctx; return scope })
  const plugin = preset.ctx.plugin(speechAgent, { delivery: 'conversation' })
  await plugin.await()
  const pipeline = new ToolExecutionPipeline(ctx)
  const call = async owner => {
    const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'speak', arguments: { text: '同一个人设的语音' }, agent: owner, signal: signal() })
    return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
  }
  try {
    assert.equal((await call(desktop)).value.adapter, 'file')
    assert.equal((await call(qq)).value.adapter, 'qqbot')
    assert.equal(sends[1].request.maxDurationMs, 25000)
    assert.equal(sends[1].request.splitLongText, true)
    const delivered = new Promise(resolve => ctx.on('speech/delivered', payload => { if (payload.automatic) resolve() }))
    const session = { id: qq.id }
    for (const event of [
      { type: 'turn/start', seq: 0, data: { turn: 1 } },
      { type: 'assistant/message', seq: 1, data: { turn: 1, message: { content: [{ type: 'text', text: '首次正常回复' }] } } },
      { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ]) ctx.emit(scopeTarget(session, qq), 'session/event', session, event)
    await delivered
    assert.equal(sends.length, 3)
    assert.equal(sends[2].context.agent, qq)
    assert.equal(sends[2].context.automatic, true)
    assert.equal(sends[2].request.text, '首次正常回复')
    await writeFile(path, '{broken')
    assert.equal((await call(desktop)).isError, true)
    assert.equal((await call(qq)).isError, true)
    assert.equal(sends.length, 3, 'unknown channel must fail before synthesis or delivery')
  } finally {
    await plugin.dispose()
    for (const scope of scopes) await scope.dispose()
    await preset.dispose(); await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
