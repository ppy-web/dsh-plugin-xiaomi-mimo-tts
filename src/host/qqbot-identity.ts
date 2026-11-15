import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseQqIdentity, type QqIdentity } from './qqbot-memory.js'
import { qqbotDataRoot } from './qqbot-paths.js'
import { TtsProviderError } from './provider-error.js'

export function qqCompanionNamespace(ctx: Context, owner?: string): string {
  const loader = ctx.get('loader')
  return `${loader?.config.baseUrl ?? resolve(process.cwd())}\n${owner ?? loader?.locate(ctx.fiber) ?? 'speech-delivery-qqbot'}`
}

export type QqConversation = { kind: 'qqbot'; identity: QqIdentity } | { kind: 'dsh' } | { kind: 'unknown'; reason: 'missing' | 'invalid' }

/** Read-only QQBot 0.5.x session mapping used for identity checks. */
export class QqIdentityReader {
  constructor(readonly path = join(qqbotDataRoot(), 'model-prefs.json')) {}
  private async readMapping(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const data = await readFile(this.path, { encoding: 'utf8', signal })
    signal?.throwIfAborted()
    if (Buffer.byteLength(data) > 8 * 1024 * 1024) throw new Error('oversized mapping')
    const value = JSON.parse(data) as { sessionIds?: Record<string, unknown> }
    if (!value.sessionIds || typeof value.sessionIds !== 'object' || Array.isArray(value.sessionIds)) throw new Error('missing mapping')
    return value.sessionIds
  }
  async list(): Promise<QqIdentity[]> {
    try {
      const mapping = await this.readMapping()
      const result = new Map<string, QqIdentity>()
      for (const [key, sessionId] of Object.entries(mapping)) {
        if (typeof sessionId !== 'string' || !sessionId) continue
        const identity = parseQqIdentity(key)
        if (identity) result.set(identity.key, identity)
      }
      return [...result.values()]
    } catch { return [] }
  }
  async inspect(sessionId: string, signal?: AbortSignal): Promise<QqConversation> {
    try {
      const mapping = await this.readMapping(signal)
      const matches = Object.entries(mapping).filter(([, id]) => id === sessionId)
      const identity = matches.length === 1 ? parseQqIdentity(matches[0]![0]) : undefined
      if (identity) return { kind: 'qqbot', identity }
      if (matches.length === 0) return { kind: 'dsh' }
    } catch (error) {
      signal?.throwIfAborted()
      return { kind: 'unknown', reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid' }
    }
    return { kind: 'unknown', reason: 'invalid' }
  }
  async resolve(sessionId: string): Promise<QqIdentity> {
    const result = await this.inspect(sessionId)
    if (result.kind === 'qqbot') return result.identity
    throw new TtsProviderError('qqbot-identity-unavailable', 'QQ conversation identity is unavailable or ambiguous. Send a new QQ message and check QQbot.', 409)
  }
}
