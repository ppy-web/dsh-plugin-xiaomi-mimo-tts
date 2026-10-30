import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SpeechDeliveryContext, SpeechDeliveryResult } from '../host-api.js'
import { TtsProviderError } from './provider-error.js'
import { SPEECH_FILE_TTL_MS } from './speech-files.js'

export const QQBOT_MEDIA_ROOT = join(homedir(), '.dsh-qqbot', 'media')
const packageRoot = () => dirname(fileURLToPath(import.meta.resolve('dsh-xiaomi-tts/package.json')))

export interface WhaleMeme {
  id: string
  mood: string
  description: string
  context: string
  path: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Catalog owned by the enabled QQ component; withdrawing it unloads scoped meme tools. */
    qqbotMemes: readonly WhaleMeme[]
  }
}

/** Both presets select from the same bundled catalog; optional missing images are skipped. */
export function loadWhaleMemes(root = packageRoot()): WhaleMeme[] {
  try {
    const directory = join(root, 'skills', 'whale-girl')
    const catalog = JSON.parse(readFileSync(join(directory, 'memes.json'), 'utf8'))
    if (!Array.isArray(catalog.memes)) return []
    const seen = new Set<string>()
    return catalog.memes.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return []
      const { file, mood, description, context, automatic } = entry as Record<string, unknown>
      if (automatic !== true || typeof file !== 'string' || !/^[a-z]+(?:-[a-z]+)+\.webp$/u.test(file)
        || typeof mood !== 'string' || !file.endsWith(`-${mood}.webp`)
        || typeof description !== 'string' || typeof context !== 'string' || seen.has(file)) return []
      const path = join(directory, 'meme', file)
      try { if (!statSync(path).isFile()) return [] } catch { return [] }
      seen.add(file)
      return [{ id: file.slice(0, -5), mood, description, context, path }]
    })
  } catch { return [] }
}

export function buildQqbotPersona(root = packageRoot()): string {
  const skill = readFileSync(join(root, 'skills', 'qqbot-whale-girl', 'SKILL.md'), 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  const rows = loadWhaleMemes(root).map(meme => `- ${meme.id} / ${meme.mood} / ${meme.description} / ${meme.context}`)
  return `${skill}\n\n## 本次安装可发送的表情包\n\n${rows.length ? rows.join('\n') : '当前没有可用素材，使用文字回复。'}\n`
}

/** Use the same Agent and tool pipeline as ordinary QQ file sends, including scoped policy. */
export async function sendQqbotFile(ctx: Context, path: string, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult> {
  const { agent, signal } = context
  signal.throwIfAborted()
  if (!ctx.tools.get('qqbot_send_file', agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending files.', 409)
  const result = await ctx.tools.execute({
    callId: ToolCallId(randomUUID()),
    name: 'qqbot_send_file',
    arguments: { file_path: path },
    agent,
    signal,
  })
  if (result.isError) throw new TtsProviderError('qqbot-send-failed', 'QQ delivery failed. Check QQBot logs before retrying.')
  const value = result.value as { messageId?: unknown; target?: unknown }
  return {
    adapter: 'qqbot',
    ...(typeof value?.messageId === 'string' ? { messageId: value.messageId } : {}),
    ...(typeof value?.target === 'string' ? { target: value.target } : {}),
  }
}

/** Only a catalog entry chosen by ID is copied; callers never supply source paths or targets. */
export async function sendWhaleMeme(ctx: Context, meme: WhaleMeme, context: SpeechDeliveryContext, directory = QQBOT_MEDIA_ROOT): Promise<SpeechDeliveryResult> {
  context.signal.throwIfAborted()
  if (!ctx.tools.get('qqbot_send_file', context.agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending memes.', 409)
  const data = await readFile(meme.path)
  context.signal.throwIfAborted()
  await mkdir(directory, { recursive: true })
  const path = join(directory, `dsh-meme-${randomUUID()}.webp`)
  await writeFile(path, data, { flag: 'wx', mode: 0o600 })
  try {
    context.signal.throwIfAborted()
    return await sendQqbotFile(ctx, path, context)
  } finally {
    await rm(path, { force: true }).catch(() => { ctx.logger.warn('QQ meme artifact cleanup failed.') })
  }
}

/** Recover only our own expired copies after a crash, without touching other QQBot media. */
export async function cleanupQqbotMemes(directory = QQBOT_MEDIA_ROOT, now = Date.now()): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  await Promise.all(entries.filter(entry => entry.isFile() && /^dsh-meme-[a-f0-9-]+\.webp$/u.test(entry.name)).map(async entry => {
    const path = join(directory, entry.name)
    try {
      if (now - (await stat(path)).mtimeMs > SPEECH_FILE_TTL_MS) await rm(path, { force: true })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }))
}
