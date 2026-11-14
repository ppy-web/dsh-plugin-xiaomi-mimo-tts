import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SpeechDeliveryContext, SpeechDeliveryResult } from '../host-api.js'
import { TtsProviderError } from './provider-error.js'
import { SPEECH_FILE_TTL_MS } from './speech-files.js'
import { DEFAULT_WHALE_SETTINGS, type WhalePersona } from '../types/whale.js'
import { buildWhalePersona, whalePackageRoot, type WhaleMeme } from './whale-persona.js'
import { QQBOT_FILE_TOOL, qqbotDeliverySignals } from './qqbot-delivery-signal.js'

export const QQBOT_MEDIA_ROOT = join(homedir(), '.dsh-qqbot', 'media')
export { loadWhaleMemes } from './whale-persona.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Catalog owned by the enabled QQ component; withdrawing it unloads scoped meme tools. */
    qqbotMemes: readonly WhaleMeme[]
  }
}

export function buildQqbotPersona(root = whalePackageRoot(), persona: WhalePersona = DEFAULT_WHALE_SETTINGS.persona): string {
  return buildWhalePersona('qq', { persona, memory: { enabled: true } }, root)
}

/** Use the same Agent and tool pipeline as ordinary QQ file sends, including scoped policy. */
export async function sendQqbotFile(ctx: Context, path: string, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult> {
  const { agent, signal } = context
  signal.throwIfAborted()
  ctx.logger.debug(`dsh-xiaomi-tts: QQ file delivery start agent=${agent.id} file=${path}`)
  if (!ctx.tools.get(QQBOT_FILE_TOOL, agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending files.', 409)
  const pipeline = new ToolExecutionPipeline(ctx, { get: (name, scope) => ctx.tools.get(name, scope) })
  const invocationSignal = AbortSignal.any([signal])
  if (context.validateRoute) qqbotDeliverySignals.add(invocationSignal)
  let result
  try {
    const prepared = await pipeline.prepare({ callId: ToolCallId(randomUUID()), name: QQBOT_FILE_TOOL, arguments: { file_path: path }, agent, signal: invocationSignal })
    if (prepared.kind === 'dispatch') await context.validateRoute?.(invocationSignal)
    const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
    result = await pipeline.complete(prepared.exec, outcome)
  } finally { qqbotDeliverySignals.delete(invocationSignal) }
  if (result.isError) {
    ctx.logger.warn(`dsh-xiaomi-tts: QQ file delivery failed agent=${agent.id}`)
    throw new TtsProviderError('qqbot-send-failed', 'QQ delivery failed. Check QQBot logs before retrying.')
  }
  const value = result.value as { messageId?: unknown; target?: unknown }
  const delivery = {
    adapter: 'qqbot',
    ...(typeof value?.messageId === 'string' ? { messageId: value.messageId } : {}),
    ...(typeof value?.target === 'string' ? { target: value.target } : {}),
  }
  ctx.logger.debug(`dsh-xiaomi-tts: QQ file delivery sent agent=${agent.id} target=${delivery.target ?? 'unknown'}`)
  return delivery
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
