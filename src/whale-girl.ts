import type { Context } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import type { Config as PresetConfig } from '@deepseek-ai/dsh-agent-preset'
import z from '@deepseek-ai/schemastery'
import { WHALE_CONFIG_FIELDS, readWhaleConfig } from './host/whale-config.js'
import type { WhaleConfig as WhaleConfigValue } from './host/whale-config.js'
import { WhaleConversations } from './host/whale-conversations.js'
import { createQqCompanion } from './host/qqbot-companion-host.js'
import type { WhaleSettings } from './types/whale.js'

export interface Config extends Omit<PresetConfig, 'plugins'>, WhaleConfigValue {
  plugins: PresetConfig['plugins'][number][]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    whaleSettings: { current(): WhaleSettings }
    whaleConversations: WhaleConversations
  }
}

/** One configurable persona, reused by both desktop and QQ conversations. */
export default class WhaleGirl {
  static inject = ['agentPresets']
  static [EntryGroup.key] = true
  static Config: z<Config> = z.object({
    id: z.string().required(), name: z.string(), description: z.string(), order: z.number(),
    plugins: z.array(z.any()).required(), ...WHALE_CONFIG_FIELDS,
  })

  constructor(ctx: Context, config: Config) {
    const current = () => readWhaleConfig(config)
    ctx.provide('whaleSettings', { current })
    ctx.provide('whaleConversations', new WhaleConversations(undefined, () => !!ctx.get('tools')?.get('qqbot_send_file')))
    const companion = createQqCompanion(ctx, current)
    ctx.provide('qqbotCompanion', companion)
    ctx.effect(() => () => companion.dispose())
    const { persona: _persona, memory: _memory, ...preset } = config
    ctx.plugin(AgentPreset, preset)
  }
}
