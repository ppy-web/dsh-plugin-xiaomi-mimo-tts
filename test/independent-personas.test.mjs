import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ToolsService from '@deepseek-ai/dsh-tools'
import * as desktop from '../lib/whale-girl.js'
import * as qq from '../lib/qqbot.js'
import * as speechHost from '../lib/speech-host.js'

test('QQ owns its preset and live custom settings independently of the DSH component', async () => {
  const ctx = new Context(), presets = new Map(), adapters = new Map()
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('agentPresets', {
    async register(config) { presets.set(config.id, config); return () => presets.delete(config.id) },
  })
  ctx.provide('speechSynthesis', {
    registerDelivery(adapter) { adapters.set(adapter.id, adapter); return () => adapters.delete(adapter.id) },
  })
  await ctx.plugin(Loader).await()
  await ctx.plugin(ToolsService).await()
  ctx.loader.internal = {
    version: 'v2',
    async import(name) {
      if (name === 'dsh-xiaomi-tts/qqbot') return qq
      if (name === 'dsh-xiaomi-tts/whale-girl') return desktop
      throw new Error(`Unexpected plugin ${name}`)
    },
  }
  const qqConfig = { persona: { name: 'QQ 自定义角色', userAddress: 'QQ 称呼', personality: 'QQ 个性' }, memory: { enabled: false } }
  const desktopConfig = { id: 'whale-girl', plugins: [], persona: { name: '已有 DSH 角色', userAddress: 'DSH 称呼', personality: 'DSH 个性' }, memory: { enabled: true } }
  try {
    await ctx.loader.root.update([
      { id: 'speech-delivery-qqbot', name: 'dsh-xiaomi-tts/qqbot', config: qqConfig },
      { id: 'preset-whale-girl', name: 'dsh-xiaomi-tts/whale-girl', disabled: true, config: desktopConfig },
    ])
    await ctx.loader.await()
    assert.ok(presets.has('qq-speech-assistant'), 'QQ remains usable with DSH disabled')
    assert.equal(presets.has('whale-girl'), false)
    assert.ok(adapters.has('qqbot'))
    assert.equal(ctx.qqbotSettings.current().persona.personality, 'QQ 个性')
    assert.equal(ctx.qqbotSettings.current().memory.enabled, false)
    assert.equal(ctx.qqbotSettings.current().memes.enabled, true, 'older QQ configurations retain bundled memes')
    const qqEntry = ctx.loader.resolve('speech-delivery-qqbot'), qqFiber = qqEntry.fiber
    const preset = presets.get('qq-speech-assistant'), companion = ctx.qqbotCompanion
    const desktopEntry = ctx.loader.resolve('preset-whale-girl')
    await desktopEntry.update({ disabled: false })
    await ctx.loader.await()
    assert.equal(ctx.whaleSettings.current().persona.name, '已有 DSH 角色')
    await qqEntry.update({ config: { ...qqConfig, persona: { ...qqConfig.persona, name: 'QQ 新名字' }, memory: { enabled: true }, memes: { enabled: false } } })
    await ctx.loader.await()
    assert.equal(qqEntry.fiber, qqFiber, 'editing a live persona must not tear down conversations or delivery')
    assert.equal(presets.get('qq-speech-assistant'), preset)
    assert.equal(ctx.qqbotCompanion, companion)
    assert.equal(ctx.qqbotSettings.current().persona.name, 'QQ 新名字')
    assert.equal(ctx.qqbotSettings.current().memes.enabled, false)
    assert.equal(ctx.whaleSettings.current().persona.name, '已有 DSH 角色')
    assert.equal(ctx.whaleSettings.current().memes.enabled, true)
    await desktopEntry.update({ config: { ...desktopConfig, persona: { ...desktopConfig.persona, name: 'DSH 新名字' }, memory: { enabled: false } } })
    await ctx.loader.await()
    assert.equal(ctx.whaleSettings.current().persona.name, 'DSH 新名字')
    assert.equal(ctx.qqbotSettings.current().persona.name, 'QQ 新名字')
    assert.equal(ctx.qqbotSettings.current().memory.enabled, true)
    await desktopEntry.update({ disabled: true })
    await ctx.loader.await()
    assert.ok(presets.has('qq-speech-assistant'))
    assert.ok(adapters.has('qqbot'))
    await qqEntry.update({ disabled: true })
    await ctx.loader.await()
    assert.equal(presets.size, 0)
    assert.equal(adapters.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('saving the Host QQ source updates automatic delivery without reloading the service', async () => {
  const ctx = new Context()
  await ctx.plugin(Loader).await()
  ctx.loader.internal = {
    version: 'v2',
    async import(name) {
      assert.equal(name, 'dsh-xiaomi-tts/host')
      return speechHost
    },
  }
  try {
    const legacy = { petFeedEnabled: true, petFeedTarget: 'legacy-pet', petAnnouncementTypes: ['completed'] }
    await ctx.loader.root.update([{ id: 'speech-host', name: 'dsh-xiaomi-tts/host', config: { ...legacy, qqbotEnabled: false } }])
    await ctx.loader.await()
    const entry = ctx.loader.resolve('speech-host'), fiber = entry.fiber, service = ctx.speechSynthesis
    const unregister = service.registerDelivery({ id: 'qqbot', format: 'wav', async send() { return { adapter: 'qqbot' } } })
    try {
      assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), false)
      await entry.update({ config: { ...legacy, qqbotEnabled: true, provider: 'breeze', breezeEnabled: true, breezeApiKey: 'fixture-breeze-key' } })
      await ctx.loader.await()
      assert.equal(entry.fiber, fiber)
      assert.equal(ctx.speechSynthesis, service)
      assert.equal(service.currentProvider(), 'breeze')
      assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), true)
      await entry.update({ config: { ...legacy, qqbotEnabled: false } })
      await ctx.loader.await()
      assert.equal(service.isAutomaticDeliveryEnabled('qqbot'), false)
      assert.equal(service.hasDelivery('qqbot'), true, 'turning off automatic speech retains explicit delivery')
    } finally { unregister() }
  } finally { await ctx.fiber.dispose() }
})
