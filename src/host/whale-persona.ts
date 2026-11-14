import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_WHALE_SETTINGS, type WhaleSettings } from '../types/whale.js'

export const whalePackageRoot = () => dirname(fileURLToPath(import.meta.resolve('dsh-xiaomi-tts/package.json')))
const require = createRequire(import.meta.url)

export interface WhaleMeme {
  id: string
  label: string
  path: string
}

const personaModule = (root: string) => require(resolve(root, 'skills', 'whale-girl', 'persona.cjs')) as {
  (root: string, options: object): string
  loadWhaleMemes(directory: string): WhaleMeme[]
}

export function loadWhaleMemes(root = whalePackageRoot()): WhaleMeme[] {
  return personaModule(whalePackageRoot()).loadWhaleMemes(resolve(root, 'skills', 'whale-girl'))
}

/** Render the selected independent character skill with its own saved configuration. */
export function buildWhalePersona(channel: 'dsh' | 'qq', settings: WhaleSettings = DEFAULT_WHALE_SETTINGS, root = whalePackageRoot()): string {
  return personaModule(root)(root, { channel, persona: settings.persona, memoryEnabled: settings.memory.enabled, memesEnabled: settings.memes?.enabled })
}
