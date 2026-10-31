import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseQqIdentity, type QqIdentity } from './qqbot-memory.js'
import { TtsProviderError } from './provider-error.js'

export function qqCompanionNamespace(ctx: Context, owner?: string): string {
  const loader = ctx.get('loader')
  return `${loader?.config.baseUrl ?? resolve(process.cwd())}\n${owner ?? loader?.locate(ctx.fiber) ?? 'speech-delivery-qqbot'}`
}

export type QqConversation = { kind: 'qqbot'; identity: QqIdentity } | { kind: 'dsh' } | { kind: 'unknown'; reason: 'missing' | 'invalid' }

/** QQbot 0.5.x compatibility bridge. This file is read-only and contains no credentials. */
export class QqIdentityReader {
  constructor(readonly path = join(homedir(), '.dsh-qqbot', 'model-prefs.json')) {}
  async inspect(sessionId: string): Promise<QqConversation> {
    try {
      const data = await readFile(this.path, 'utf8')
      if (Buffer.byteLength(data) > 8 * 1024 * 1024) throw new Error('oversized mapping')
      const value = JSON.parse(data) as { sessionIds?: Record<string, unknown> }
      if (!value.sessionIds || typeof value.sessionIds !== 'object' || Array.isArray(value.sessionIds)) throw new Error('missing mapping')
      const matches = Object.entries(value.sessionIds).filter(([, id]) => id === sessionId)
      const identity = matches.length === 1 ? parseQqIdentity(matches[0]![0]) : undefined
      if (identity) return { kind: 'qqbot', identity }
      if (matches.length === 0) return { kind: 'dsh' }
    } catch (error) {
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
