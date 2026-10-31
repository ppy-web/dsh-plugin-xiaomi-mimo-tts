import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { SPEECH_DATA_ROOT } from './speech-files.js'
import { TtsProviderError } from './provider-error.js'

export interface QqIdentity { key: string; appId: string; scope: 'c2c' | 'group'; peerId: string }
export function parseQqIdentity(key: string): QqIdentity | undefined {
  const match = /^qqbot:([A-Za-z0-9_-]+):(c2c|group):([A-Za-z0-9_-]+)$/u.exec(key)
  return match ? { key, appId: match[1]!, scope: match[2] as 'c2c' | 'group', peerId: match[3]! } : undefined
}
export interface QqMemoryEntry { id: string; kind: 'preference' | 'requirement'; text: string; updatedAt: number }
export interface QqTopic { id: string; title: string; updatedAt: number; expiresAt: number }
export interface QqPeerState {
  version: 1
  key: string
  memoryEnabled: boolean
  entries: QqMemoryEntry[]
  topics: QqTopic[]
}
export const emptyQqState = (key: string): QqPeerState => ({
  version: 1, key, memoryEnabled: true, entries: [], topics: [],
})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const boundedText = (value: unknown, limit: number): value is string => typeof value === 'string' && [...value].length <= limit
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Reject corrupt state rather than silently replacing a saved user's memories. */
export function validateQqState(value: unknown, key: string): QqPeerState {
  const fail = (): never => { throw new TtsProviderError('qqbot-memory-corrupt', 'The local QQ memory file needs repair.', 409) }
  if (!value || typeof value !== 'object') return fail()
  const state = value as QqPeerState
  if (state.version !== 1 || state.key !== key || !parseQqIdentity(key) || typeof state.memoryEnabled !== 'boolean'
    || !Array.isArray(state.entries) || state.entries.length > 32 || !Array.isArray(state.topics) || state.topics.length > 8) return fail()
  const ids = new Set<string>()
  for (const entry of [...state.entries, ...state.topics]) {
    if (!entry || !boundedText(entry.id, 64) || !entry.id || ids.has(entry.id) || !timestamp(entry.updatedAt)) return fail()
    ids.add(entry.id)
  }
  if (state.entries.some(entry => !['preference', 'requirement'].includes(entry.kind) || !boundedText(entry.text, 300) || !entry.text.trim())
    || state.topics.some(topic => !boundedText(topic.title, 80) || !topic.title.trim() || !timestamp(topic.expiresAt))) return fail()
  // Read earlier files without discarding their memories; persist only the current memory fields.
  return {
    version: 1, key, memoryEnabled: state.memoryEnabled,
    entries: state.entries.map(({ id, kind, text, updatedAt }) => ({ id, kind, text, updatedAt })),
    topics: state.topics.map(({ id, title, updatedAt, expiresAt }) => ({ id, title, updatedAt, expiresAt })),
  }
}

/** One namespace per Host configuration instance; no memories are written into the package. */
export class QqMemoryStore {
  readonly directory: string
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(namespace: string, directory = join(SPEECH_DATA_ROOT, 'qq-companion')) {
    this.directory = join(directory, hash(namespace))
  }
  path(key: string): string {
    if (!parseQqIdentity(key)) throw new TtsProviderError('qqbot-identity-invalid')
    return join(this.directory, `${hash(key)}.json`)
  }
  async load(key: string): Promise<QqPeerState> {
    try {
      const data = await readFile(this.path(key), 'utf8')
      if (Buffer.byteLength(data) > 64 * 1024) throw new TtsProviderError('qqbot-memory-corrupt')
      return validateQqState(JSON.parse(data), key)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyQqState(key)
      if (error instanceof SyntaxError) throw new TtsProviderError('qqbot-memory-corrupt', 'The local QQ memory file needs repair.', 409)
      throw error
    }
  }
  update(key: string, mutate: (state: QqPeerState) => void, signal?: AbortSignal): Promise<QqPeerState> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const task = previous.catch(() => {}).then(async () => {
      signal?.throwIfAborted()
      await mkdir(this.directory, { recursive: true })
      const path = this.path(key), lock = `${path}.lock`, token = randomUUID()
      let acquired = false
      for (let attempt = 0; attempt < 60; attempt++) {
        signal?.throwIfAborted()
        try { await writeFile(lock, token, { flag: 'wx', mode: 0o600 }); acquired = true; break } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          // Recover stale locks left by an interrupted write.
          const age = await stat(lock).then(info => Date.now() - info.mtimeMs, () => 0)
          if (age > 5 * 60 * 1000) await rm(lock, { force: true })
          else await delay(50, undefined, signal ? { signal } : {})
        }
      }
      if (!acquired) throw new TtsProviderError('qqbot-memory-busy', 'QQ memory is being updated by another process.', 409)
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        const state = await this.load(key)
        mutate(state)
        const saved = validateQqState(state, key)
        signal?.throwIfAborted()
        await writeFile(temporary, JSON.stringify(saved), { flag: 'wx', mode: 0o600 })
        signal?.throwIfAborted()
        await rename(temporary, path)
        return saved
      } finally {
        await rm(temporary, { force: true })
        if (await readFile(lock, 'utf8').catch(() => '') === token) await rm(lock, { force: true })
      }
    })
    this.queues.set(key, task)
    void task.finally(() => { if (this.queues.get(key) === task) this.queues.delete(key) }).catch(() => {})
    return task
  }
  async drain(): Promise<void> { await Promise.allSettled(this.queues.values()) }
}
