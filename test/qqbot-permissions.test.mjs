import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Sessions from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Agents from '@deepseek-ai/dsh-agent'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as qq from '../lib/qqbot.js'
import * as qqAgent from '../lib/qqbot-agent.js'
import * as speechAgent from '../lib/speech-agent.js'

test('retained QQ conversations keep desktop tools blocked when the relay is disabled and re-enabled', async () => {
  const ctx = new Context(), owners = [], calls = []
  ctx.provide('systemPrompt', { tools() {}, section() {}, context() {} })
  ctx.provide('speechSynthesis', { registerDelivery() { return () => {} } })
  try {
    await ctx.plugin(Loader).await()
    await ctx.plugin(Sessions).await()
    await ctx.plugin(Projections).await()
    await ctx.plugin(Agents).await()
    await ctx.plugin(ToolsService).await()
    await ctx.plugin(Presets, { default: 'qq-speech-assistant' }).await()
    ctx.loader.internal = {
      version: 'v2',
      async import(name) {
        if (name === 'dsh-xiaomi-tts/qqbot') return qq
        if (name === 'dsh-xiaomi-tts/qqbot-agent') return qqAgent
        if (name === 'dsh-xiaomi-tts/speech-agent') return speechAgent
        if (name === '@deepseek-ai/dsh-time-context') return { apply() {} }
        throw new Error(`Unexpected plugin ${name}`)
      },
    }
    await ctx.loader.root.update([{ id: 'speech-delivery-qqbot', name: 'dsh-xiaomi-tts/qqbot' }])
    await ctx.loader.await()
    const createAgent = () => {
      const agent = { id: randomUUID(), session: { header: {} } }
      const owner = createScope(ctx, agent)
      agent.ctx = owner.ctx
      owners.push(owner)
      return agent
    }
    const peer = createAgent(), desktop = createAgent()
    await ctx.agentPresets.mount(peer.ctx, 'qq-speech-assistant')
    ctx.tools.register({
      name: 'local_file_read', description: 'Test desktop file tool',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'object', properties: {}, additionalProperties: false }, render: () => [] },
      execute(_args, exec) { calls.push(exec.agent.id); return {} },
    })
    const pipeline = new ToolExecutionPipeline(ctx)
    const read = async agent => {
      const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'local_file_read', arguments: {}, agent, signal: new AbortController().signal })
      return pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
    }
    const checkIsolation = async () => {
      assert.equal((await read(peer)).isError, true, 'QQ must not execute desktop tools')
      assert.ok(!calls.includes(peer.id), 'the denied tool body must not run')
      assert.equal((await read(desktop)).isError, false, 'QQ restrictions must not affect unrelated conversations')
    }
    await checkIsolation()
    assert.ok(ctx.tools.get('qqbot_memory', peer))
    const entry = ctx.loader.resolve('speech-delivery-qqbot')
    await entry.update({ disabled: true })
    await ctx.loader.await()
    assert.equal(ctx.tools.get('qqbot_memory', peer), undefined, 'disabled QQ features must be withdrawn')
    await checkIsolation()
    await entry.update({ disabled: false })
    await ctx.loader.await()
    assert.ok(ctx.tools.get('qqbot_memory', peer), 're-enabling QQ must restore its scoped features')
    await checkIsolation()
    await ctx.loader.root.update([])
    await ctx.loader.await()
    await checkIsolation()
  } finally {
    for (const owner of owners) await owner.dispose()
    await ctx.fiber.dispose()
  }
})
