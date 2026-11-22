import type { Context } from '@deepseek-ai/cordis'
import { cachedWhalePersona } from './host/whale-persona.js'
import { QQBOT_FILE_TOOL, qqbotDeliverySignals } from './host/qqbot-delivery-signal.js'
import type {} from './whale-girl.js'

export const name = 'whale-persona-agent'
export const inject = ['systemPrompt', 'tools', 'whaleSettings']
export { buildWhalePersona } from './host/whale-persona.js'

export function apply(ctx: Context): void {
  ctx.tools.guard(exec => {
    if (!exec.agent) return 'A verified conversation is required.'
    if (exec.name === QQBOT_FILE_TOOL && qqbotDeliverySignals.has(exec.signal)) return undefined
    if (exec.name.startsWith('qqbot_')) return 'QQ delivery tools are unavailable in DSH conversations.'
    return undefined
  })
  ctx.systemPrompt.section({
    name: 'deployment:persona-prefix',
    order: ctx.systemPrompt.getSectionOrder?.('DEPLOYMENT_PERSONA_PREFIX') ?? 0,
    complete: true,
    interpolate: false,
    text: cachedWhalePersona('dsh', () => ctx.whaleSettings.current()),
  })
}
