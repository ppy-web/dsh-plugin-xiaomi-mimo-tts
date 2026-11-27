import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseQqIdentity, type QqIdentity } from './qqbot-memory.js'
import { TtsProviderError } from './provider-error.js'

export function resolveQqbotHome(dataDir = process.env.QQBOT_DATA_DIR, userHome = homedir()): string {
  const trimmed = dataDir?.trim()
  if (trimmed && isAbsolute(trimmed)) return resolve(trimmed)
  return join(userHome, '.dsh-qqbot')
}

export function qqCompanionNamespace(ctx: Context, owner?: string): string {
  const loader = ctx.get('loader')
  return `${loader?.config.baseUrl ?? resolve(process.cwd())}\n${owner ?? loader?.locate(ctx.fiber) ?? 'speech-delivery-qqbot'}`
}

export type QqConversation = { kind: 'qqbot'; identity: QqIdentity } | { kind: 'dsh' } | { kind: 'unknown'; reason: 'missing' | 'invalid' }

interface CachedIdentityMapping {
  mtimeMs: number
  size: number
  identities: QqIdentity[]
  sessions: Map<string, QqIdentity | 'ambiguous'>
}

const TRANSIENT_MAPPING_ERRORS = new Set(['ENOENT', 'EPERM', 'EBUSY'])

/** Read-only QQBot 0.5.x session mapping used for identity checks. */
export class QqIdentityReader {
  private cached: CachedIdentityMapping | undefined
  constructor(readonly path = join(resolveQqbotHome(), 'model-prefs.json')) {}
  private async readMappingOnce(signal?: AbortSignal): Promise<CachedIdentityMapping> {
    const info = await stat(this.path)
    signal?.throwIfAborted()
    if (info.size > 8 * 1024 * 1024) throw new Error('oversized mapping')
    if (this.cached && this.cached.mtimeMs === info.mtimeMs && this.cached.size === info.size) return this.cached
    const data = await readFile(this.path, { encoding: 'utf8', signal })
    signal?.throwIfAborted()
    if (Buffer.byteLength(data) > 8 * 1024 * 1024) throw new Error('oversized mapping')
    const value = JSON.parse(data) as { sessionIds?: Record<string, unknown> }
    if (!value.sessionIds || typeof value.sessionIds !== 'object' || Array.isArray(value.sessionIds)) throw new Error('missing mapping')
    const unique = new Map<string, QqIdentity>()
    const sessions = new Map<string, QqIdentity | 'ambiguous'>()
    for (const [key, sessionId] of Object.entries(value.sessionIds)) {
      if (typeof sessionId !== 'string' || !sessionId) continue
      const identity = parseQqIdentity(key)
      if (identity) unique.set(identity.key, identity)
      sessions.set(sessionId, sessions.has(sessionId) ? 'ambiguous' : (identity ?? 'ambiguous'))
    }
    this.cached = { mtimeMs: info.mtimeMs, size: info.size, identities: [...unique.values()], sessions }
    return this.cached
  }
  private async readMapping(signal?: AbortSignal): Promise<CachedIdentityMapping> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.readMappingOnce(signal)
      } catch (error) {
        signal?.throwIfAborted()
        const code = (error as NodeJS.ErrnoException).code
        const retryable = error instanceof SyntaxError || (typeof code === 'string' && TRANSIENT_MAPPING_ERRORS.has(code))
        if (!retryable || attempt >= 2) throw error
        await delay(25, undefined, signal ? { signal } : {})
      }
    }
  }
  async list(): Promise<QqIdentity[]> {
    try {
      return (await this.readMapping()).identities
    } catch { return [] }
  }
  async inspect(sessionId: string, signal?: AbortSignal): Promise<QqConversation> {
    try {
      const mapping = await this.readMapping(signal)
      const matched = mapping.sessions.get(sessionId)
      if (matched === undefined) return { kind: 'dsh' }
      if (matched !== 'ambiguous') return { kind: 'qqbot', identity: matched }
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
