import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { DEFAULT_WHALE_PERSONA } from '../types/whale.js'
import type { WhaleSettings } from '../types/whale.js'

export { DEFAULT_WHALE_PERSONA } from '../types/whale.js'
export type { WhalePersona, WhaleSettings } from '../types/whale.js'

const messages = (language: string) => JSON.parse(readFileSync(new URL(`./locale/whale-girl/${language}.json`, import.meta.resolve('dsh-xiaomi-tts/package.json')), 'utf8')).config

const Persona = z.object({
  name: z.string().min(1).max(60).default(DEFAULT_WHALE_PERSONA.name),
  selfReference: z.string().min(1).max(40).default(DEFAULT_WHALE_PERSONA.selfReference),
  userAddress: z.string().max(40).default(DEFAULT_WHALE_PERSONA.userAddress),
  relationship: z.string().max(1000).default(DEFAULT_WHALE_PERSONA.relationship),
  personality: z.string().max(1200).default(''),
  replyStyle: z.string().max(1200).default(''),
  likes: z.string().max(1000).default(DEFAULT_WHALE_PERSONA.likes),
  boundaries: z.string().max(1200).default(''),
}).i18n({ zh: messages('zh').persona, en: messages('en').persona })
const Memory = z.object({ enabled: z.boolean().default(true) })

/** These live objects use the Host's native component configuration form. */
export const WHALE_CONFIG_FIELDS = {
  persona: Persona.default(DEFAULT_WHALE_PERSONA).volatile(),
  memory: Memory.default({ enabled: true }).volatile(),
}
export const WhaleConfig: z<WhaleConfig> = z.object(WHALE_CONFIG_FIELDS).i18n({ zh: messages('zh'), en: messages('en') })
export interface WhaleConfig {
  persona: Volatile<WhaleSettings['persona']>
  memory: Volatile<WhaleSettings['memory']>
}
export function readWhaleConfig(config: WhaleConfig): WhaleSettings {
  return { persona: config.persona.get(), memory: config.memory.get() }
}
