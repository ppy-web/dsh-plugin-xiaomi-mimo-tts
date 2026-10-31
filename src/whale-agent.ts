import type { Context } from '@deepseek-ai/cordis'
import { buildWhalePersona } from './host/whale-persona.js'
import { registerQqbotCompanionTools, registerQqbotMemeTool } from './qqbot-agent.js'
import type {} from './whale-girl.js'

export const name = 'whale-persona-agent'
export const inject = ['systemPrompt', 'tools', 'whaleSettings', 'whaleConversations']
export { buildWhalePersona } from './host/whale-persona.js'
export { WhaleConversations } from './host/whale-conversations.js'

export function apply(ctx: Context): void {
  const qqTools = new Set(['speak', 'synthesize_speech', 'qqbot_memory', 'qqbot_send_meme', 'qqbot_send_file'])
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.agent) await ctx.whaleConversations.resolve(exec.agent)
    return next()
  })
  ctx.tools.guard(exec => {
    if (!exec.agent) return 'A verified conversation is required.'
    const route = ctx.whaleConversations.get(exec.agent)
    if (route.kind === 'unknown') return 'Conversation channel is unavailable.'
    if (route.kind === 'qqbot' && !qqTools.has(exec.name)) return 'Desktop workspace tools are unavailable in QQ.'
    if (route.kind === 'dsh' && exec.name.startsWith('qqbot_')) return 'QQ delivery tools are unavailable in DSH conversations.'
    return undefined
  })
  const cache = new Map<string, { signature: string; text: string }>()
  ctx.systemPrompt.section({
    name: 'deployment:persona-prefix', order: 0, complete: true, interpolate: false,
    text: ({ agent }) => {
      const route = agent ? ctx.whaleConversations.get(agent) : { kind: 'unknown' }
      const channel = route.kind === 'qqbot' ? 'qq' : route.kind === 'dsh' ? 'dsh' : 'unknown'
      const settings = ctx.whaleSettings.current(), signature = JSON.stringify(settings)
      if (cache.get(channel)?.signature !== signature) cache.set(channel, { signature, text: buildWhalePersona(channel, settings) })
      return cache.get(channel)!.text
    },
  })
  ctx.systemPrompt.context({
    name: 'xiaomi:qqbot-memory', order: 300, required: true, interpolate: false,
    text: ({ agent }) => agent && ctx.whaleConversations.get(agent).kind === 'qqbot'
      ? ctx.get('qqbotCompanion')?.context(agent) ?? '当前 QQ 记忆不可用，不要声称已保存。' : '',
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const route = await ctx.whaleConversations.resolve(agent)
    if (route.kind === 'qqbot') {
      try { await ctx.get('qqbotCompanion')?.prepare(agent) } catch { /* Memory context reports the diagnostic; text chat remains available. */ }
    }
    return next()
  })
  ctx.on('agent/disposed', ({ agent }) => {
    ctx.whaleConversations.release(agent)
    ctx.get('qqbotCompanion')?.release(agent)
  })
  ctx.inject(['tools', 'qqbotCompanion'], scoped => { registerQqbotCompanionTools(scoped) })
  ctx.inject(['tools', 'qqbotCompanion', 'qqbotMemes'], scoped => { registerQqbotMemeTool(scoped) })
}
