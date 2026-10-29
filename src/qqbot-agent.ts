import type { Context } from '@deepseek-ai/cordis'
import { sendWhaleMeme } from './host/qqbot-media.js'
import { TtsProviderError } from './host/provider-error.js'

export { buildQqbotPersona, cleanupQqbotMemes, loadWhaleMemes } from './host/qqbot-media.js'

export const name = 'qqbot-whale-memes'
export const inject = ['tools', 'qqbotMemes']

/** Mounted inside the QQ preset so other conversations do not inherit QQ send capabilities. */
export function apply(ctx: Context): void {
  registerQqbotMemeTool(ctx)
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
    execute(args, exec) {
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
