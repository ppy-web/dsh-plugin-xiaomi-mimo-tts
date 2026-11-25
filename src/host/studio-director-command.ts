import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FileBlock, ImageBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { STUDIO_DIRECTOR_COMMAND_NAME, STUDIO_DIRECTOR_SLASH_COMMAND } from '../constants.js'
import { registerStudioTools } from '../studio-agent.js'

interface DirectorSessionState {
  active: boolean
  entered: boolean
}

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
        const args = typeof event.data.args === 'string' ? event.data.args.trim().toLowerCase() : ''
        pending.set(event.data.commandId, args !== 'off')
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

  const states = new WeakMap<Session, DirectorSessionState>()
  const pendingRuns = new WeakMap<Session, Map<string, boolean>>()

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

  track(registerStudioTools(ctx, {
    when: ({ agent }) => getState(agent.session).entered,
  }))

  if (typeof ctx.on === 'function') {
    track(ctx.on('session/event', (session, event) => {
      const ev = event as unknown as { type?: unknown; data?: Record<string, unknown> }
      if (ev.type === 'command/run' && ev.data?.name === STUDIO_DIRECTOR_COMMAND_NAME && typeof ev.data.commandId === 'string') {
        const args = typeof ev.data.args === 'string' ? ev.data.args.trim().toLowerCase() : ''
        let runs = pendingRuns.get(session)
        if (!runs) {
          runs = new Map()
          pendingRuns.set(session, runs)
        }
        runs.set(ev.data.commandId, args !== 'off')
      } else if (ev.type === 'command/done' && typeof ev.data?.commandId === 'string') {
        const runs = pendingRuns.get(session)
        const target = runs?.get(ev.data.commandId)
        if (target !== undefined) {
          runs?.delete(ev.data.commandId)
          if (ev.data.kind === 'success') {
            const current = getState(session)
            states.set(session, { active: target, entered: current.entered || target })
          }
        }
      }
    }))
  }

  track(commands.register({
    name: STUDIO_DIRECTOR_COMMAND_NAME,
    description: '将上传文档或创意编排成多角色剧本，可保存到录音棚并后台录制',
    input: { hint: '[off | 题材或改编要求]，可上传文档', attachments: true },
    handler: ({ agent, rawInput, attachments, signal }) => {
      if (signal.aborted) {
        return { kind: 'error', text: '导演模式命令已取消。' }
      }
      const message = rawInput.trim()
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
  }
}
