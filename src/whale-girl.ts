import type { Context } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import type { Config as PresetConfig } from '@deepseek-ai/dsh-agent-preset'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { WHALE_CONFIG_FIELDS, readWhaleConfig } from './host/whale-config.js'
import type { WhaleConfig as WhaleConfigValue } from './host/whale-config.js'
import type { WhaleSettings } from './types/whale.js'

export interface Config extends Omit<PresetConfig, 'plugins'>, WhaleConfigValue {
  plugins: PresetConfig['plugins'][number][]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    whaleSettings: { current(): WhaleSettings }
  }
}

/** Configurable DSH persona, independent of the optional QQ component. */
export default class WhaleGirl {
  static inject = ['agentPresets']
  static [EntryGroup.key] = true
  static Config: z<Config> = z.object({
    id: z.string().required(), name: z.string(), description: z.string(), order: z.number(),
    plugins: z.array(z.any()).required(), ...WHALE_CONFIG_FIELDS,
  })

  constructor(ctx: Context, config: Config) {
    ctx.inject(['settings'], child => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'preset-whale-girl: custom settings page')
    })
    const current = () => readWhaleConfig(config)
    ctx.provide('whaleSettings', { current })
    const { persona: _persona, memory: _memory, ...preset } = config
    ctx.plugin(AgentPreset, preset)
  }
}
