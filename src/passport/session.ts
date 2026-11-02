import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { SPEECH_DATA_ROOT } from '../host/speech-files.js'

interface SessionIdentity { sessionId: string; preset: string }

/** Persist only routing identity, partitioned by Host profile and component entry. */
export class PassportSessionStore {
  readonly path: string
  constructor(namespace: string, private readonly directory = join(SPEECH_DATA_ROOT, 'passport')) {
    this.path = join(directory, `${createHash('sha256').update(namespace).digest('hex')}.json`)
  }

  async load(): Promise<SessionIdentity | undefined> {
    let text: string
    try { text = await readFile(this.path, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    const value = JSON.parse(text) as Partial<SessionIdentity> | null
    if (!value || typeof value.sessionId !== 'string' || !/^passport-[a-f0-9-]{36}$/u.test(value.sessionId)
      || typeof value.preset !== 'string' || !value.preset) throw new Error('passport-invalid-session-state')
    return { sessionId: value.sessionId, preset: value.preset }
  }

  async save(value: SessionIdentity): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.path)
    } finally { await rm(temporary, { force: true }) }
  }
}

/** The device never supplies a session id, preset, model route, or credentials. */
export class PassportSession {
  private handle: AgentHandle | undefined
  private pending: Promise<AgentHandle> | undefined
  private readonly lifetime = new AbortController()

  constructor(private readonly ctx: Context, private readonly preset = '', private readonly cwd = '', private readonly store = new PassportSessionStore(
    `${ctx.get('loader')?.config.baseUrl ?? resolve(process.cwd())}\n${ctx.get('loader')?.locate(ctx.fiber) ?? 'passport'}`,
  )) {}

  get agent() { return this.handle?.agent }

  acquire(): Promise<AgentHandle> {
    this.lifetime.signal.throwIfAborted()
    return this.pending ??= this.open().catch(error => { this.pending = undefined; throw error })
  }

  private async open(): Promise<AgentHandle> {
    const identity = await this.store.load()
    const preset = await this.ctx.agentPresets.resolve(this.preset || identity?.preset || undefined)
    if (preset.broken) throw new Error('passport-preset-unavailable')
    if (identity && this.preset && identity.preset !== preset.id) throw new Error('passport-preset-changed')
    await using lease = await this.ctx.agentPresets.acquireScope(preset.id)
    void lease
    const options = {
      signal: this.lifetime.signal,
      agentOptions: this.agentOptions(),
      setup: async (agentCtx: Context) => { await this.ctx.agentPresets.mount(agentCtx, preset.id) },
    }
    const handle = identity
      ? await this.ctx.agents.resume({ ...options, resumeSessionId: identity.sessionId as AgentHandle['agent']['id'] })
      : await this.ctx.agents.create({ ...options, sessionId: `passport-${randomUUID()}` as AgentHandle['agent']['id'],
        meta: { agentPreset: preset.id, cwd: resolve(this.cwd || process.cwd()) } })
    this.handle = handle
    try {
      this.lifetime.signal.throwIfAborted()
      // Resume may drain durable inbox work. Do not attach the device to old replies.
      await handle.agent.whenIdle()
      this.lifetime.signal.throwIfAborted()
      if (!identity) await this.store.save({ sessionId: handle.agent.id, preset: preset.id })
      return handle
    } catch (error) { this.handle = undefined; await handle.dispose(); throw error }
  }

  private agentOptions() {
    const defaults = this.ctx.agentDefaultModel
    return {
      get provider() { return defaults.currentSelection().provider },
      get model() { return defaults.currentSelection().model },
      get reasoningEffort() { return defaults.currentSelection().reasoningEffort },
    }
  }

  submit(text: string): void {
    if (!this.handle) throw new Error('passport-session-unavailable')
    this.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  }

  cancel(): void { this.handle?.agent.cancel({ kind: 'user' }) }

  async dispose(): Promise<void> {
    this.lifetime.abort()
    this.cancel()
    const handle = await this.pending?.catch(() => undefined)
    await handle?.dispose()
    this.handle = undefined
  }
}
