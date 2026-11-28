import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FileBlock, ImageBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { AgentToolRegistry } from '@deepseek-ai/dsh-tools/pipeline'
import { STUDIO_DIRECTOR_COMMAND_NAME, STUDIO_DIRECTOR_SLASH_COMMAND } from '../constants.js'
import { STUDIO_TOOL_NAMES, registerStudioTools } from '../studio-agent.js'
import { TtsProviderError } from './provider-error.js'
import type { HostSpeechStudioService } from './studio-service.js'

interface DirectorSessionState {
  active: boolean
  entered: boolean
}

interface ActiveDirectorRequest {
  requestId: string
  messageId: string
  previousState: DirectorSessionState
  dispatched: boolean
  admitted: boolean
  turn?: number
}

const TRACKED_DIRECTOR_INPUT = /^--request-id(?:\s|$)/u

export interface HostDirectorCommandInvocation {
  readonly commandId: string
  readonly agent: Agent
  readonly rawInput: string
  readonly attachments: readonly (ImageBlock | FileBlock)[]
  readonly signal: AbortSignal
}

export type HostDirectorCommandResult =
  | { readonly kind: 'success'; readonly text?: string }
  | { readonly kind: 'error'; readonly text: string }

interface HostCommandRuntime {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input?: { readonly hint: string; readonly attachments?: boolean }
    readonly handler: (invocation: HostDirectorCommandInvocation) => HostDirectorCommandResult | Promise<HostDirectorCommandResult>
  }): () => void
}

interface PromptAssembleContext {
  readonly session?: Session
  readonly agent?: Agent
}

interface HostSystemPrompt {
  getSectionOrder?: (name: string) => number
  section(section: {
    readonly name: string
    readonly order: number
    readonly text: string | ((context: PromptAssembleContext) => string)
    readonly interpolate?: boolean
    readonly replacement?: string
    readonly retirement?: string
  }): () => void
}

let cachedDirectorPrompt: string | null = null

const STUDIO_DIRECTOR_EMPTY_START_PROMPT = [
  '用户刚刚通过 /director 进入了有声剧导演模式，尚未提供题材或原文。',
  '请先调用 studio_inspect，再邀请用户上传文章、小说或宣传文案，或提供原创题材。按导演规范确认会影响改编的要素。',
].join('\n')

const STUDIO_DIRECTOR_NOTICE_SOURCE = {
  kind: 'studio-director',
  form: 'notice',
  summary: '已进入有声剧导演模式，等待补充创作要素',
} as unknown as MessageSource

function packageRoot(): string {
  try {
    return dirname(fileURLToPath(import.meta.resolve('dsh-xiaomi-tts/package.json')))
  } catch {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  }
}

/** Load the Studio Director prompt markdown from the bundled skill document. */
export function loadStudioDirectorPrompt(root = packageRoot()): string {
  if (root === packageRoot() && cachedDirectorPrompt !== null) return cachedDirectorPrompt
  const raw = readFileSync(resolve(root, 'skills', 'studio-director', 'SKILL.md'), 'utf8')
  const prompt = raw.replace(/^---[\s\S]*?---\s*/u, '').trim()
  if (root === packageRoot()) cachedDirectorPrompt = prompt
  return prompt
}

function sessionFromPromptContext(context: PromptAssembleContext | undefined): Session | undefined {
  return context?.agent?.session ?? context?.session
}

function replayDirectorState(session: Session): DirectorSessionState {
  const reader = (session as unknown as { snapshotEvents?: () => readonly unknown[] }).snapshotEvents
  if (typeof reader !== 'function') return { active: false, entered: false }
  let active = false
  let entered = false
  const pending = new Map<string, boolean>()
  try {
    for (const raw of reader.call(session)) {
      const event = raw as { type?: unknown; data?: Record<string, unknown> }
      if (event.type === 'command/run' && event.data?.name === STUDIO_DIRECTOR_COMMAND_NAME && typeof event.data.commandId === 'string') {
        const args = typeof event.data.args === 'string' ? event.data.args.trim() : ''
        if (!TRACKED_DIRECTOR_INPUT.test(args)) pending.set(event.data.commandId, args.toLowerCase() !== 'off')
      } else if (event.type === 'command/done' && typeof event.data?.commandId === 'string') {
        const target = pending.get(event.data.commandId)
        if (target !== undefined) {
          pending.delete(event.data.commandId)
          if (event.data.kind === 'success') {
            active = target
            entered = entered || target
          }
        }
      }
    }
  } catch {
    return { active: false, entered: false }
  }
  return { active, entered }
}

/**
 * Declare the Host `/director` slash command alongside progressive-disclosure
 * Studio tools and conditional director system prompt sections.
 */
export function registerStudioDirectorCommand(ctx: Context): () => void {
  const commands = (ctx as unknown as { commands?: HostCommandRuntime }).commands
  const systemPrompt = (ctx as unknown as { systemPrompt?: HostSystemPrompt }).systemPrompt
  if (!commands || !systemPrompt) return () => {}

  const studio = ctx.speechStudio as HostSpeechStudioService
  const states = new WeakMap<Session, DirectorSessionState>()
  const pendingRuns = new WeakMap<Session, Map<string, boolean>>()
  const activeRequests = new Map<Session, ActiveDirectorRequest>()

  const getState = (session: Session): DirectorSessionState => {
    const existing = states.get(session)
    if (existing !== undefined) return existing
    const replayed = replayDirectorState(session)
    states.set(session, replayed)
    return replayed
  }

  const disposers: Array<() => void> = []
  const track = (dispose: unknown): void => {
    if (typeof dispose === 'function') disposers.push(dispose as () => void)
  }

  const studioTools = new AgentToolRegistry()
  const syncTools = (agent: Agent | undefined): void => {
    if (!agent) return
    studioTools.set(agent, getState(agent.session).entered ? STUDIO_TOOL_NAMES : [])
  }
  const syncSessionTools = (session: Session): void => {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    syncTools(agents?.get?.(session.id))
  }

  const finishRequest = async (
    session: Session,
    outcome: Parameters<HostSpeechStudioService['finishDirectorRequest']>[1],
  ): Promise<void> => {
    const request = activeRequests.get(session)
    if (!request) return
    activeRequests.delete(session)
    if (request.dispatched) {
      states.set(session, request.previousState)
      syncSessionTools(session)
      await studio.finishDirectorRequest(request.requestId, outcome)
    }
  }

  async function submitTrackedRequest(invocation: HostDirectorCommandInvocation, input: string): Promise<HostDirectorCommandResult> {
    const { agent, attachments, signal } = invocation
    const [, requestId, prompt = ''] = /^--request-id\s+(\S+)(?:\s+([\s\S]*))?$/u.exec(input) ?? []
    if (!requestId) return { kind: 'error', text: 'invalid-studio-director-request-id' }
    if (!prompt && attachments.length === 0) return { kind: 'error', text: 'studio-director-input-required' }
    const content = [...attachments, ...(prompt ? [{ type: 'text' as const, text: prompt }] : [])]
    const message = createUserMessage({ content, source: { kind: 'user' } })
    const fingerprint = createHash('sha256').update(JSON.stringify(content)).digest('hex')
    const { session } = agent
    const request: ActiveDirectorRequest = {
      requestId,
      messageId: message.id,
      previousState: getState(session),
      dispatched: false,
      admitted: false,
    }
    const canStart = !activeRequests.has(session) && agent.status !== 'running'
    if (canStart) activeRequests.set(session, request)

    let created: boolean
    try {
      created = await studio.beginDirectorRequest(requestId, fingerprint, canStart)
    } catch (error) {
      if (activeRequests.get(session) === request) activeRequests.delete(session)
      if (error instanceof TtsProviderError) return { kind: 'error', text: error.code }
      throw error
    }
    if (!created) {
      if (activeRequests.get(session) === request) activeRequests.delete(session)
      return { kind: 'success', text: `录音棚已有导演请求 ${requestId}。` }
    }
    if (signal.aborted || activeRequests.get(session) !== request || agent.status === 'running') {
      if (activeRequests.get(session) === request) activeRequests.delete(session)
      await studio.finishDirectorRequest(requestId, 'interrupted')
      return { kind: 'error', text: signal.aborted ? 'studio-director-interrupted' : 'studio-director-session-busy' }
    }

    request.previousState = getState(session)
    request.dispatched = true
    states.set(session, { active: true, entered: true })
    syncTools(agent)
    try { agent.steer(message) }
    catch (error) {
      await finishRequest(session, 'failed')
      throw error
    }
    return { kind: 'success', text: `已提交录音棚导演请求 ${requestId}。` }
  }

  const baseOrder = (systemPrompt.getSectionOrder?.('PLAN_POLICY') ?? 500) + 20

  track(systemPrompt.section({
    name: 'studio-director:policy',
    order: baseOrder,
    interpolate: false,
    retirement: 'Audio drama director mode is no longer available.',
    text: (context) => {
      const session = sessionFromPromptContext(context)
      if (!session || !getState(session).entered) return ''
      return `以下指令仅在有声剧导演模式激活时生效。\n\n${loadStudioDirectorPrompt()}`
    },
  }))

  track(systemPrompt.section({
    name: 'studio-director:status',
    order: baseOrder + 1,
    interpolate: false,
    replacement: '',
    retirement: 'Audio drama director mode is inactive.',
    text: (context) => {
      const session = sessionFromPromptContext(context)
      if (!session) return ''
      const state = getState(session)
      if (!state.entered) return ''
      return state.active
        ? '有声剧导演模式当前已激活。请按上方导演规范处理当前请求。'
        : '有声剧导演模式当前已关闭。请恢复普通助手模式，不再继续导演工作流程。'
    },
  }))

  track(registerStudioTools(ctx, agent => {
    const request = activeRequests.get(agent.session)
    return request?.admitted ? request.requestId : undefined
  }, studioTools))
  track(ctx.tools.include(studioTools))
  if (typeof ctx.get === 'function') {
    for (const agent of ctx.get('agents')?.list?.() ?? []) syncTools(agent)
  }

  if (typeof ctx.on === 'function') {
    track(ctx.on('agent/created', ({ agent }) => { syncTools(agent) }, { global: true }))
    track(ctx.on('session/event', (session, event) => {
      const request = activeRequests.get(session)
      if (request?.dispatched) {
        if (event.type === 'turn/start') request.turn = event.data.turn
        if (event.type === 'user/message' && event.data.id === request.messageId) request.admitted = true
        if (event.type === 'turn/end' && event.data.turn === request.turn) {
          switch (event.data.reason.kind) {
            case 'completed': return finishRequest(session, 'completed')
            case 'aborted':
            case 'interrupted': return finishRequest(session, 'interrupted')
            default: return finishRequest(session, 'failed')
          }
        }
      }
      const ev = event as unknown as { type?: unknown; data?: Record<string, unknown> }
      if (ev.type === 'command/run' && ev.data?.name === STUDIO_DIRECTOR_COMMAND_NAME && typeof ev.data.commandId === 'string') {
        const args = typeof ev.data.args === 'string' ? ev.data.args.trim() : ''
        if (TRACKED_DIRECTOR_INPUT.test(args)) return
        let runs = pendingRuns.get(session)
        if (!runs) {
          runs = new Map()
          pendingRuns.set(session, runs)
        }
        runs.set(ev.data.commandId, args.toLowerCase() !== 'off')
      } else if (ev.type === 'command/done' && typeof ev.data?.commandId === 'string') {
        const runs = pendingRuns.get(session)
        const target = runs?.get(ev.data.commandId)
        if (target !== undefined) {
          runs?.delete(ev.data.commandId)
          if (ev.data.kind === 'success') {
            const current = getState(session)
            states.set(session, { active: target, entered: current.entered || target })
            syncSessionTools(session)
          }
        }
      }
    }))
    track(ctx.on('session/disposed', session => finishRequest(session, 'interrupted')))
  }

  track(commands.register({
    name: STUDIO_DIRECTOR_COMMAND_NAME,
    description: '将上传文档或创意编排成多角色剧本，可保存到录音棚并后台录制',
    input: { hint: '[off | 题材或改编要求]，可上传文档', attachments: true },
    handler: invocation => {
      const { agent, rawInput, attachments, signal } = invocation
      if (signal.aborted) {
        return { kind: 'error', text: '导演模式命令已取消。' }
      }
      const message = rawInput.trim()
      if (TRACKED_DIRECTOR_INPUT.test(message)) return submitTrackedRequest(invocation, message)
      if (activeRequests.has(agent.session)) return { kind: 'error', text: 'studio-director-session-busy' }
      if (message.toLowerCase() === 'off') {
        if (attachments.length > 0) {
          return { kind: 'error', text: `退出导演模式（${STUDIO_DIRECTOR_SLASH_COMMAND} off）不支持附带附件。` }
        }
        const current = getState(agent.session)
        if (!current.active) {
          return { kind: 'success', text: '当前未处于有声剧导演模式。' }
        }
        states.set(agent.session, { active: false, entered: true })
        return { kind: 'success', text: '已退出有声剧导演模式。' }
      }

      states.set(agent.session, { active: true, entered: true })
      syncTools(agent)
      if (message.length > 0 || attachments.length > 0) {
        agent.steer(createUserMessage({
          content: [
            ...attachments,
            ...(message.length > 0 ? [{ type: 'text' as const, text: message }] : []),
          ],
          source: { kind: 'user' },
        }))
        return {
          kind: 'success',
          text: `已进入有声剧导演模式，正在查看录音棚配置并核对创作要素。输入 ${STUDIO_DIRECTOR_SLASH_COMMAND} off 可随时退出。`,
        }
      }

      agent.steer(createUserMessage({
        content: [{ type: 'text', text: STUDIO_DIRECTOR_EMPTY_START_PROMPT }],
        source: STUDIO_DIRECTOR_NOTICE_SOURCE,
      }))
      return {
        kind: 'success',
        text: `已进入有声剧导演模式。可上传文档、粘贴原文或提供创意。输入 ${STUDIO_DIRECTOR_SLASH_COMMAND} off 可随时退出。`,
      }
    },
  }))

  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
    for (const session of activeRequests.keys()) {
      void finishRequest(session, 'interrupted').catch(() => ctx.logger.warn('Studio director request could not be interrupted.'))
    }
  }
}
