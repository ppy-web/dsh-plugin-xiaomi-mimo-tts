import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import * as speechAgent from '../lib/speech-agent.js'
import * as speechHost from '../lib/speech-host.js'

const settle = () => new Promise(resolve => setImmediate(resolve))

test('headless entry supplies synthesis without WebServer and cleans up on unload', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(speechHost, { apiKey: 'sk-headless-test' })
  try {
    await settle()
    assert.equal(ctx.get('webServer'), undefined)
    assert.equal(ctx.speechSynthesis.hasDelivery('file'), true)
    await assert.rejects(ctx.speechSynthesis.synthesize({ text: '' }), error => error.code === 'text-required')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

for (const delivery of ['custom-channel', 'qqbot']) test(`${delivery} speech tools execute through the Host pipeline and follow their automatic policy`, async () => {
  const ctx = new Context()
  const exports = [], sends = [], deliveries = []
  const agent = { id: randomUUID(), session: { header: {} } }
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('agents', { get: () => agent })
  ctx.provide('speechSynthesis', {
    hasDelivery: () => true,
    isAutomaticDeliveryEnabled: () => delivery === 'qqbot',
    async exportAudio(request) { exports.push(request); return { path: '/managed/speech.wav', size: 100, format: 'wav' } },
    async deliver(request, adapter, context) { sends.push({ request, adapter, context }); return { adapter, messageId: 'delivered' } },
  })
  ctx.plugin(ToolsService)
  await settle()
  const key = {}
  const preset = createScope(ctx, key)
  const owner = createScope(ctx, agent, { parent: key })
  agent.ctx = owner.ctx
  const plugin = preset.ctx.plugin(speechAgent, { delivery })
  await settle()
  ctx.on('speech/delivered', payload => { deliveries.push(payload) })
  const call = async (name, args) => ctx.tools.execute({ callId: ToolCallId(randomUUID()), name, arguments: args, agent, signal: new AbortController().signal })
  try {
    assert.equal(ctx.tools.get('speak'), undefined, 'the capability is only visible through its preset')
    const exported = await call('synthesize_speech', { text: '文件', format: 'wav' })
    assert.equal(exported.isError, false)
    assert.equal(exported.value.path, '/managed/speech.wav')
    assert.equal(exports[0].text, '文件')
    const spoken = await call('speak', { text: '说给当前会话' })
    assert.equal(spoken.isError, false)
    assert.equal(sends[0].context.agent, agent)
    assert.equal(sends[0].adapter, delivery)
    assert.equal(deliveries[0].automatic, false)
    const invalid = await call('speech_mode', { mode: 'not-a-mode' })
    assert.equal(invalid.isError, true)
    const mode = await call('speech_mode', { mode: 'status' })
    if (delivery === 'qqbot') assert.equal(mode.isError, true, 'QQ uses the source switch instead of a separate session mode tool')
    else assert.equal(mode.value.mode, 'manual')
    const session = { id: agent.id }
    ctx.emit(scopeTarget(session, agent), 'session/event', session, { type: 'turn/start', seq: 0, data: { turn: 1 } })
    const text = '超过原有自动发送字数限制的回复。'.repeat(100)
    ctx.emit(scopeTarget(session, agent), 'session/event', session, { type: 'assistant/message', seq: 1, data: { turn: 1, message: { content: [{ type: 'text', text }] } } })
    ctx.emit(scopeTarget(session, agent), 'session/event', session, { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } })
    await settle()
    assert.equal(sends.length, delivery === 'qqbot' ? 2 : 1)
    if (delivery === 'qqbot') {
      assert.equal(sends[1].request.maxDurationMs, undefined)
      assert.equal(sends[1].request.splitLongText, true)
      assert.equal(sends[1].context.automatic, true)
    }
    await plugin.dispose()
    assert.equal(ctx.tools.get('speak', agent), undefined)
  } finally {
    await owner.dispose(); await preset.dispose(); await ctx.fiber.dispose()
  }
})
