import type { Context } from '@deepseek-ai/cordis'
import { sendWhaleMeme } from './host/qqbot-media.js'
import { TtsProviderError } from './host/provider-error.js'
import type { QqMemoryInput } from './host/qqbot-companion.js'

export { buildQqbotPersona, cleanupQqbotMemes, loadWhaleMemes } from './host/qqbot-media.js'

export const name = 'qqbot-whale-memes'
export const inject = ['tools', 'qqbotMemes', 'qqbotCompanion', 'whaleConversations']

/** Channel tools are admitted only for verified QQ conversations in the shared preset. */
export function apply(ctx: Context): void {
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
    const route = await ctx.whaleConversations.resolve(agent)
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
    description: 'Send one bundled Whale Girl reaction image as a real file to the current QQ conversation. Select a meme ID from the persona catalog. Use occasionally when it fits the conversation or on request. A successful call already sent the image; do not send it again.',
    parameters: { type: 'object', properties: { meme: { type: 'string', enum: memes.map(meme => meme.id) } }, required: ['meme'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { adapter: { type: 'string' }, meme: { type: 'string' }, messageId: { type: 'string' }, target: { type: 'string' } }, required: ['adapter', 'meme'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new TtsProviderError('qqbot-agent-required', 'Send memes from a QQ agent conversation.', 400)
      await ctx.qqbotCompanion.prepare(exec.agent)
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
  }, { when: async ({ agent, signal }) => {
    const route = await ctx.whaleConversations.resolve(agent)
    signal.throwIfAborted()
    return route.kind === 'qqbot'
  } })
}
