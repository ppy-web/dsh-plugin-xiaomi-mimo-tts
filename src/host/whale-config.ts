import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { DEFAULT_WHALE_PERSONA } from '../types/whale.js'
import type { WhaleSettings } from '../types/whale.js'

export { DEFAULT_WHALE_PERSONA } from '../types/whale.js'
export type { WhalePersona, WhaleSettings } from '../types/whale.js'

const messages = (component: 'whale-girl' | 'qqbot', language: string) => JSON.parse(readFileSync(new URL(`./locale/${component}/${language}.json`, import.meta.resolve('dsh-xiaomi-tts/package.json')), 'utf8')).config

/** Each component owns distinct live values, while sharing the field contract. */
export function whaleConfigFields(component: 'whale-girl' | 'qqbot') {
  const Persona = z.object({
    name: z.string().min(1).max(60).default(DEFAULT_WHALE_PERSONA.name),
    selfReference: z.string().min(1).max(40).default(DEFAULT_WHALE_PERSONA.selfReference),
    userAddress: z.string().max(40).default(DEFAULT_WHALE_PERSONA.userAddress),
    relationship: z.string().max(1000).default(DEFAULT_WHALE_PERSONA.relationship),
    personality: z.string().max(1200).default(''),
    replyStyle: z.string().max(1200).default(DEFAULT_WHALE_PERSONA.replyStyle),
    likes: z.string().max(1000).default(DEFAULT_WHALE_PERSONA.likes),
    boundaries: z.string().max(1200).default(''),
  }).i18n({ zh: messages(component, 'zh').persona, en: messages(component, 'en').persona })
  const Memory = z.object({ enabled: z.boolean().default(true) })
    .i18n({ zh: messages(component, 'zh').memory, en: messages(component, 'en').memory })

  return {
    persona: Persona.default(DEFAULT_WHALE_PERSONA).volatile(),
    memory: Memory.default({ enabled: true }).volatile(),
  }
}
export const WHALE_CONFIG_FIELDS = whaleConfigFields('whale-girl')
export const WhaleConfig: z<WhaleConfig> = z.object(WHALE_CONFIG_FIELDS).i18n({ zh: messages('whale-girl', 'zh'), en: messages('whale-girl', 'en') })
export interface WhaleConfig {
  persona: Volatile<WhaleSettings['persona']>
  memory: Volatile<WhaleSettings['memory']>
}
export function readWhaleConfig(config: WhaleConfig): WhaleSettings {
  return { persona: config.persona.get(), memory: config.memory.get() }
}
