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
    text: () => {
      const speech = ctx.get('speechSynthesis')
      const provider = speech?.currentProvider?.() ?? 'xiaomi'
      return JSON.stringify({ automaticSpeech: speech?.isAutomaticDeliveryEnabled?.('qqbot') === true, delivery: 'qqbot', provider, voice: 'saved-host-settings' })
        + '\n先按表情包规则判断本轮是否适合调用 qqbot_send_meme；允许按语境主动发图，不必等用户要求。automaticSpeech 只控制正文朗读，不代表用户要求“只要语音”，也不关闭表情包。为 true 时，完成适合的表情发送后输出最终正文，宿主在本轮成功结束后自动发送语音，不要另调 speak；但用户明确要求本轮换一种语气、情绪、方言或表达方式时例外：调用 speak 并传入 speechInstruction，它会取代本轮自动语音。为 false 时普通聊天回复文字。用户明确要求语音时调用 speak，传正文；若同时指定了语气、情绪、方言或表达方式，再传 speechInstruction（与正文同语言，简洁描述），仍沿用已保存的服务商、模型和音色。合成失败且尚未发送音频时，允许增加 provider 参数，在 xiaomi、doubao 与 breeze 之间切换服务商重试一次（仅使用已配置的服务商），并继续使用同一 speechInstruction；所选服务商已保存的模型和音色不变。'
        + (provider === 'breeze'
          ? '当前服务商是 Breeze：仅在 speak 的 text 中，可按实际情绪或动作在自然停顿处加入 speak 工具说明里 Breeze audio tags 清单中的标签，每次少量、不要堆叠；中文正文用方括号标签，英文正文用圆括号标签，不混用，只使用清单内的精确拼写。普通聊天回复和自动语音正文都不要写标签。'
          : '当前服务商不是 Breeze：正文不要使用 [笑]、(sighs) 一类声音标签，speak 的 text 和普通回复都只写可朗读的正文，用 speechInstruction 描述语气。')
        + '已取消、发送受限、已发送部分音频或发送结果不明时不要自动重发。speak 成功后本轮直接结束：不要输出任何最终文字，不要解释“没有补正文”“只发了语音”，也不要复述发送状态、工具结果或用括号、省略号占位；用户同时要求语音和文字时才补正文。重试仍失败时使用文字回复。'
    },
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    try { await ctx.qqbotCompanion.prepare(agent) } catch { /* Memory reports its diagnostic; voice and text remain available. */ }
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
    const route = await ctx.qqbotCompanion.identity.inspect(agent.id)
    signal.throwIfAborted()
    return route.kind === 'qqbot'
  } })
}

export function registerQqbotMemeTool(ctx: Context, options: { directory?: string } = {}): void {
  const memes = ctx.qqbotMemes
  if (!memes.length) return
  const lifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled(pending)
  })
  ctx.tools.register({
    name: 'qqbot_send_meme',
    description: 'Send one bundled Whale Girl reaction image as a real file to the current QQ conversation. Select a meme ID from the persona catalog. Proactively use an appropriate image in casual chat before the final reply; no explicit image request is needed. Use occasionally, not every turn, and respect requests for no images or voice only. Automatic speech does not disable images. A successful call already sent the image; do not send it again.',
    parameters: { type: 'object', properties: { meme: { type: 'string', enum: memes.map(meme => meme.id) } }, required: ['meme'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { adapter: { type: 'string' }, meme: { type: 'string' }, messageId: { type: 'string' }, target: { type: 'string' } }, required: ['adapter', 'meme'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new TtsProviderError('qqbot-agent-required', 'Send memes from a QQ agent conversation.', 400)
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
  })
}
