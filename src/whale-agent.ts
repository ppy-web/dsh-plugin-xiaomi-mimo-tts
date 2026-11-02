import type { Context } from '@deepseek-ai/cordis'
import { buildWhalePersona } from './host/whale-persona.js'
import type {} from './whale-girl.js'

export const name = 'whale-persona-agent'
export const inject = ['systemPrompt', 'tools', 'whaleSettings']
export { buildWhalePersona } from './host/whale-persona.js'

export function apply(ctx: Context): void {
  ctx.tools.guard(exec => {
    if (!exec.agent) return 'A verified conversation is required.'
    if (exec.name.startsWith('qqbot_')) return 'QQ delivery tools are unavailable in DSH conversations.'
    return undefined
  })
  let cached: { signature: string; text: string } | undefined
  ctx.systemPrompt.section({
    name: 'deployment:persona-prefix', order: 0, complete: true, interpolate: false,
    text: () => {
      const settings = ctx.whaleSettings.current(), signature = JSON.stringify(settings)
      if (cached?.signature !== signature) cached = { signature, text: buildWhalePersona('dsh', settings) }
      return cached.text
    },
  })
}
