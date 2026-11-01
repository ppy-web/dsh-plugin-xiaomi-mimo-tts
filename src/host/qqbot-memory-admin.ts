import { randomUUID } from 'node:crypto'
import { QqIdentityReader } from './qqbot-identity.js'
import { QqMemoryStore, parseQqIdentity, type QqMemoryEntry, type QqPeerState, type QqTopic } from './qqbot-memory.js'
import { TtsProviderError } from './provider-error.js'

export type QqMemoryAdminInput = {
  key: string
  action: 'save' | 'delete' | 'clear' | 'pause' | 'resume'
  id?: string
  kind?: 'preference' | 'requirement' | 'topic'
  text?: string
  expiresInDays?: number
}

export type QqMemoryAdminPeer = {
  key: string
  appId: string
  scope: 'c2c' | 'group'
  peerId: string
  memoryEnabled: boolean
  entries: QqMemoryEntry[]
  topics: QqTopic[]
}

const fail = (code: string): never => { throw new TtsProviderError(code, code, 400) }

/** Settings-only access to already-known QQ memory namespaces. */
export class QqMemoryAdmin {
  constructor(readonly store: QqMemoryStore, readonly identity = new QqIdentityReader()) {}

  private async known(key: string): Promise<void> {
    if (!parseQqIdentity(key) || !(await this.identity.list()).some(item => item.key === key)) fail('qqbot-memory-identity-unavailable')
  }

  async list(): Promise<QqMemoryAdminPeer[]> {
    const peers = await this.identity.list()
    return Promise.all(peers.map(async peer => {
      const state = await this.store.load(peer.key)
      return { ...peer, memoryEnabled: state.memoryEnabled, entries: state.entries, topics: state.topics }
    }))
  }

  async update(input: QqMemoryAdminInput): Promise<QqMemoryAdminPeer> {
    if (!input || typeof input.key !== 'string' || !['save', 'delete', 'clear', 'pause', 'resume'].includes(input.action)) fail('qqbot-memory-input-invalid')
    await this.known(input.key)
    const peer = parseQqIdentity(input.key)!
    const state = await this.store.update(input.key, current => {
      if (input.action === 'clear') { current.entries = []; current.topics = []; return }
      if (input.action === 'pause') { current.memoryEnabled = false; return }
      if (input.action === 'resume') { current.memoryEnabled = true; return }
      if (input.action === 'delete') {
        if (!input.id || ![...current.entries, ...current.topics].some(item => item.id === input.id)) fail('qqbot-memory-not-found')
        current.entries = current.entries.filter(item => item.id !== input.id)
        current.topics = current.topics.filter(item => item.id !== input.id)
        return
      }
      const text = typeof input.text === 'string' ? input.text.trim() : fail('qqbot-memory-input-invalid')
      const kind = input.kind ?? fail('qqbot-memory-input-invalid')
      if (!text) fail('qqbot-memory-input-invalid')
      if (kind === 'topic') {
        if ([...text].length > 80 || (input.expiresInDays !== undefined && (!Number.isFinite(input.expiresInDays) || input.expiresInDays <= 0 || input.expiresInDays > 30))) fail('qqbot-memory-input-invalid')
        const existing = input.id ? current.topics.find(item => item.id === input.id) : undefined
        if (input.id && !existing) fail('qqbot-memory-not-found')
        if (!existing && current.topics.length >= 8) fail('qqbot-memory-full')
        const now = Date.now(), id = existing?.id ?? randomUUID(), days = input.expiresInDays ?? (existing ? Math.max(1, (existing.expiresAt - now) / 86400000) : 7)
        current.topics = [...current.topics.filter(item => item.id !== id), { id, title: text, updatedAt: now, expiresAt: now + Math.round(days * 86400000) }]
      } else {
        if ([...text].length > 300 || (kind !== 'preference' && kind !== 'requirement')) fail('qqbot-memory-input-invalid')
        const existing = input.id ? current.entries.find(item => item.id === input.id) : undefined
        if (input.id && !existing) fail('qqbot-memory-not-found')
        if (!existing && current.entries.length >= 32) fail('qqbot-memory-full')
        const id = existing?.id ?? randomUUID()
        current.entries = [...current.entries.filter(item => item.id !== id), { id, kind, text, updatedAt: Date.now() }]
      }
    })
    return { ...peer, memoryEnabled: state.memoryEnabled, entries: state.entries, topics: state.topics }
  }
}
