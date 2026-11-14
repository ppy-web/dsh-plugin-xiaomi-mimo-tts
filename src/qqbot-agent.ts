import type { Context } from '@deepseek-ai/cordis'
import { sendWhaleMeme } from './host/qqbot-media.js'
import { TtsProviderError } from './host/provider-error.js'
import type { QqMemoryInput } from './host/qqbot-companion.js'
import { buildWhalePersona } from './host/whale-persona.js'
import type {} from './qqbot.js'

export { buildQqbotPersona, cleanupQqbotMemes, loadWhaleMemes } from './host/qqbot-media.js'

export const name = 'qqbot-whale-memes'
export const inject = ['tools']

/** The QQ-only preset owns its persona and tools; speech routing never reads memory mappings. */
export function apply(ctx: Context): void {
  const allowed = new Set(['speak', 'synthesize_speech', 'qqbot_memory', 'qqbot_send_meme', 'qqbot_send_file'])
  ctx.tools.guard(exec => !exec.agent || exec.agent.session.header.origin === 'subagent'
    ? 'A QQ conversation is required.'
    : allowed.has(exec.name) ? undefined : 'Desktop workspace tools are unavailable in QQ.')
  // Retained conversations outlive the relay's services; their guard must stay active.
  ctx.inject(['systemPrompt', 'qqbotMemes', 'qqbotCompanion', 'qqbotSettings'], registerQqbotFeatures)
}

function registerQqbotFeatures(ctx: Context): void {
  let cached: { signature: string; text: string } | undefined
  ctx.systemPrompt.section({
    name: 'deployment:persona-prefix', order: 0, complete: true, interpolate: false,
    text: () => {
      const settings = ctx.qqbotSettings.current(), signature = JSON.stringify(settings)
      if (cached?.signature !== signature) cached = { signature, text: buildWhalePersona('qq', settings) }
      return cached.text
    },
  })
  ctx.systemPrompt.context({
    name: 'xiaomi:qqbot-memory', order: 300, required: true, interpolate: false,
    text: ({ agent }) => agent ? ctx.qqbotCompanion.context(agent) : '',
  })
  ctx.systemPrompt.context({
    name: 'xiaomi:qqbot-speech', order: 310, required: true, interpolate: false,
    text: ({ agent }) => {
      const speech = ctx.get('speechSynthesis')
      const bridge = ctx.get('qqbotSpeech')
      if (agent && bridge && (!bridge.admitted(agent) || !speech?.hasDelivery('qqbot'))) return ''
      const provider = speech?.currentProvider?.() ?? 'xiaomi'
      return JSON.stringify({ automaticSpeech: speech?.isAutomaticDeliveryEnabled?.('qqbot') === true, delivery: 'qqbot', provider, voice: 'saved-host-settings' })
        + '\n'
        + 'automaticSpeech 为 true 时，输出最终正文，宿主在本轮成功结束后自动发送语音，不要另调 speak；但用户明确要求本轮换一种语气、情绪、方言或表达方式时例外：调用 speak 并传入 speechInstruction，它会取代本轮自动语音。为 false 时普通聊天回复文字。用户明确要求语音时调用 speak，传正文；若同时指定了语气、情绪、方言或表达方式，再传 speechInstruction（与正文同语言，简洁描述），仍沿用已保存的服务商、模型和音色。合成失败且尚未发送音频时，允许增加 provider 参数，在 xiaomi、doubao 与 breeze 之间切换服务商重试一次（仅使用已配置的服务商），并继续使用同一 speechInstruction；移除原供应商标签，再按新供应商能力决定是否添加标签。所选服务商已保存的模型和音色不变。'
        + (provider === 'breeze'
          ? '当前服务商是 Breeze：仅在 speak 的 text 中，可按实际情绪或动作在自然停顿处加入 speak 工具说明里 Breeze audio tags 清单中的标签，每次少量、不要堆叠；中文正文用方括号标签，英文正文用圆括号标签，不混用，只使用清单内的精确拼写。普通聊天回复和自动语音正文都不要写标签。'
          : provider === 'xiaomi' && speech?.supportsAudioTags?.() === true
            ? '当前服务商是小米 MiMo 预置音色：仅在 speak 的 text 中按需使用 Xiaomi MiMo audio tags。句首可用 (温柔 俏皮) 指定整体风格，句内可用 [轻笑]、（紧张，深呼吸）等标签；支持中英文、自定义声音描述及组合，只写可听见的语气、情绪、呼吸或哭笑，不写身体动作，少量不堆叠。唱歌必须在 text 最开头放 (唱歌)、(sing) 或 (singing)。普通聊天回复和自动语音正文不要写标签。'
            : '当前服务商或模型不支持音频标签：speak 的 text 和普通回复都只写可朗读的正文，用 speechInstruction 描述语气；小米 VoiceDesign 也遵守此规则。')
        + '已取消、发送受限、已发送部分音频或发送结果不明时不要自动重发。speak 成功后本轮直接结束：不要输出任何最终文字，不要解释“没有补正文”“只发了语音”，也不要复述发送状态、工具结果或用括号、省略号占位；用户同时要求语音和文字时才补正文。重试仍失败时使用文字回复。'
    },
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (ctx.qqbotSettings.current().memory.enabled) {
      try { await ctx.qqbotCompanion.prepare(agent) } catch { /* Memory reports its diagnostic; voice and text remain available. */ }
    }
    return next()
  })
  ctx.on('agent/disposed', ({ agent }) => { ctx.qqbotCompanion.release(agent) })
  registerQqbotMemeTool(ctx)
  registerQqbotCompanionTools(ctx)
}

export function registerQqbotCompanionTools(ctx: Context): void {
  const output = {
    schema: { type: 'object' as const, additionalProperties: true },
    render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
  ctx.tools.register({
    name: 'qqbot_memory',
    description: 'Manage local memory for this QQ conversation only. Save explicit stable requirements/preferences during normal chat; update by ID, list, forget, clear, pause or resume. Topics are short labels to continue during a later normal conversation; they do not schedule messages. Group memory is public to this group, not individual profiles. No background model calls. Confirm saving only after success.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['save', 'list', 'forget', 'clear', 'pause', 'resume'] },
      id: { type: 'string', maxLength: 64 },
      kind: { type: 'string', enum: ['preference', 'requirement', 'topic'] },
      text: { type: 'string', minLength: 1, maxLength: 300 },
      expiresInDays: { type: 'number', exclusiveMinimum: 0, maximum: 30 },
    }, required: ['action'], additionalProperties: false },
    output,
    execute(args, exec) {
      if (!exec.agent) throw new TtsProviderError('qqbot-agent-required')
      return ctx.qqbotCompanion.memory(exec.agent, args as QqMemoryInput, exec.signal)
    },
  }, { when: async ({ agent, signal }) => {
    if (!ctx.qqbotSettings.current().memory.enabled) return false
    const route = await ctx.qqbotCompanion.identity.inspect(agent.id)
    signal.throwIfAborted()
    return route.kind === 'qqbot' && ctx.qqbotSettings.current().memory.enabled
  } })
}

export function registerQqbotMemeTool(ctx: Context, options: { directory?: string } = {}): void {
  const memes = ctx.qqbotMemes
  if (!memes.length) return
  const enabled = () => ctx.qqbotSettings.current().memes?.enabled !== false
  const lifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled(pending)
  })
  ctx.tools.register({
    name: 'qqbot_send_meme',
    description: 'Send one bundled Whale Girl reaction image to the current QQ conversation using its catalog ID.',
    parameters: { type: 'object', properties: { meme: { type: 'string', enum: memes.map(meme => meme.id) } }, required: ['meme'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { adapter: { type: 'string' }, meme: { type: 'string' }, messageId: { type: 'string' }, target: { type: 'string' } }, required: ['adapter', 'meme'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new TtsProviderError('qqbot-agent-required', 'Send memes from a QQ agent conversation.', 400)
      if (!enabled()) throw new TtsProviderError('qqbot-memes-disabled', 'QQ Whale Girl memes are disabled in settings.', 409)
      const meme = memes.find(entry => entry.id === (args as { meme?: unknown } | null)?.meme)
      if (!meme) throw new TtsProviderError('qqbot-meme-unavailable', 'Choose an available meme from the catalog.', 400)
      const signal = AbortSignal.any([exec.signal, lifetime.signal])
      const task = sendWhaleMeme(ctx, meme, { agent: exec.agent, signal }, options.directory)
        .then(result => ({ ...result, meme: meme.id }))
      pending.add(task)
      const done = () => { pending.delete(task) }
      void task.then(done, done)
      return task
    },
  }, { when: enabled })
}
