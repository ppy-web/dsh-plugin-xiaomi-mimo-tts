import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import * as speechAgent from '../lib/speech-agent.js'
import * as whaleAgent from '../lib/whale-agent.js'
import * as qqAgent from '../lib/qqbot-agent.js'
import { DEFAULT_WHALE_PERSONA } from '../lib/qqbot.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
const signal = () => new AbortController().signal

test('independent presets keep DSH file delivery and QQ full automatic voice isolated from persona and memory', async () => {
  const ctx = new Context(), sends = [], agents = new Map()
  let automatic = true
  ctx.provide('systemPrompt', { tools() {}, section() {}, context() {} })
  ctx.provide('agents', { get: id => agents.get(id) })
  ctx.provide('whaleSettings', { current: () => ({ persona: { ...DEFAULT_WHALE_PERSONA, name: 'DSH 独立角色' }, memory: { enabled: true } }) })
  ctx.provide('qqbotSettings', { current: () => ({ persona: { ...DEFAULT_WHALE_PERSONA, name: 'QQ 独立角色' }, memory: { enabled: true } }) })
  ctx.provide('qqbotMemes', [])
  ctx.provide('qqbotCompanion', {
    identity: { inspect: async () => { throw new Error('memory mapping unavailable') } },
    prepare: async () => { throw new Error('memory file corrupt') }, context: () => 'memory unavailable', release() {},
  })
  ctx.provide('qqbotSpeechRules', { current: () => ({ maxAutoCharacters: 0, maxDurationMs: 0 }) })
  ctx.provide('speechSynthesis', {
    hasDelivery: () => true, isAutomaticDeliveryEnabled: id => id === 'qqbot' && automatic,
    async deliver(request, adapter, context) { sends.push({ request, adapter, context }); return { adapter } },
  })
  ctx.plugin(ToolsService)
  await settle()
  const globalSender = ctx.tools.register({
    name: 'qqbot_send_file', description: 'globally visible QQ sender', parameters: { type: 'object' },
    output: { schema: { type: 'object' }, render: () => [] }, execute() { return {} },
  })
  const scopes = []
  const create = async (delivery, persona) => {
    const key = {}, preset = createScope(ctx, key)
    const agent = { id: randomUUID(), session: { header: {} } }
    agents.set(agent.id, agent)
    const scope = createScope(ctx, agent, { parent: key }); agent.ctx = scope.ctx
    scopes.push(scope, preset)
    await preset.ctx.plugin(persona).await()
    await preset.ctx.plugin(speechAgent, { delivery }).await()
    return agent
  }
  const desktop = await create('file', whaleAgent), qq = await create('qqbot', qqAgent)
  const pipeline = new ToolExecutionPipeline(ctx)
  const speak = async agent => {
    const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'speak', arguments: { text: '显式语音' }, agent, signal: signal() })
    return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
  }
  let seq = 0
  const turn = (agent, number, text, kind = 'completed') => {
    const session = { id: agent.id }
    for (const event of [
      { type: 'turn/start', data: { turn: number } },
      { type: 'assistant/message', data: { turn: number, message: { content: [{ type: 'text', text }] } } },
      { type: 'turn/end', data: { turn: number, reason: { kind } } },
    ]) ctx.emit(scopeTarget(session, agent), 'session/event', session, { ...event, seq: seq++ })
  }
  try {
    assert.equal((await speak(desktop)).value.adapter, 'file', 'global QQ sender must not route DSH audio to QQ')
    assert.equal((await speak(qq)).value.adapter, 'qqbot')
    const text = '完整回复不受旧的三百字默认限制.'.repeat(100)
    turn(desktop, 1, '桌面不会自动传声')
    turn(qq, 1, text)
    await settle()
    assert.equal(sends.length, 3)
    assert.equal(sends[2].request.text, text)
    assert.equal(sends[2].request.splitLongText, true)
    assert.equal(sends[2].context.agent, qq)
    assert.equal(sends[2].context.automatic, true)
    automatic = false
    turn(qq, 2, '已关闭自动语音')
    await settle()
    assert.equal(sends.length, 3)
    assert.equal((await speak(qq)).value.adapter, 'qqbot', 'explicit voice remains available')
    automatic = true
    turn(qq, 3, '被打断', 'aborted')
    await settle()
    assert.equal(sends.length, 4)
    turn(qq, 4, '恢复自动语音')
    await settle()
    assert.equal(sends.length, 5)
    for (const scope of scopes) await scope.dispose()
    turn(qq, 5, '卸载后不发送')
    await settle()
    assert.equal(sends.length, 5)
  } finally {
    globalSender()
    for (const scope of scopes) await scope.dispose()
    await ctx.fiber.dispose()
  }
})
