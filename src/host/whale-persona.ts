import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_WHALE_SETTINGS, type WhaleSettings } from '../types/whale.js'

export const whalePackageRoot = () => dirname(fileURLToPath(import.meta.resolve('dsh-xiaomi-tts/package.json')))
const require = createRequire(import.meta.url)

/** The installed skill and one builder own the personality for every channel. */
export function buildWhalePersona(channel: 'dsh' | 'qq' | 'unknown', settings: WhaleSettings = DEFAULT_WHALE_SETTINGS, root = whalePackageRoot()): string {
  const build = require(join(root, 'skills', 'whale-girl', 'persona.cjs')) as (root: string, options: object) => string
  return build(root, { channel, persona: settings.persona, memoryEnabled: settings.memory.enabled })
}
