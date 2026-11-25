import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { STUDIO_DIRECTOR_SLASH_COMMAND } from '../../constants.js'
import { studioZh } from './studio-copy.js'

const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

/** Default guided checklist appended after `/director ` when launching a script session. */
export const STUDIO_DIRECTOR_DRAFT_GUIDE = studioZh['studio.directorDraftGuide']

/** Combine `/director` with the guided element checklist for the Host composer. */
export function buildStudioDirectorDraftInput(guide = STUDIO_DIRECTOR_DRAFT_GUIDE): string {
  const trimmed = guide.trim()
  return trimmed.length > 0
    ? `${STUDIO_DIRECTOR_SLASH_COMMAND} ${trimmed}`
    : `${STUDIO_DIRECTOR_SLASH_COMMAND} `
}

/** Initial composer text that arms the Host `/director` slash command with guided elements. */
export const STUDIO_DIRECTOR_DRAFT_INPUT = buildStudioDirectorDraftInput()

export interface LaunchStudioDirectorOptions {
  readonly prompt?: string
}

export interface HostWorkspaceView {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}

export interface HostWorkspacesService {
  readonly list?: {
    getSnapshot(): { readonly items: readonly HostWorkspaceView[] }
  }
  initializeDefault?: (signal?: AbortSignal) => Promise<HostWorkspaceView | undefined>
}

export interface HostUiWorkspaceService {
  openWorkspace?: (
    workspaceId: string,
    beforeOpen?: (sessionId: SessionId) => void,
    options?: { readonly agentPreset?: string },
  ) => Promise<void>
  startSession?: (
    workspaceId?: string,
    options?: {
      readonly prompt?: string
      readonly clearPreviousDraft?: boolean
      readonly whenDraftExists?: 'replace' | 'append' | 'keep'
      readonly agentPreset?: string
    },
  ) => void
}

export interface HostConversationService {
  readonly input?: {
    for?: (actx: Context) => {
      readonly state?: { getSnapshot(): { readonly draft?: string } }
      focus?: () => void
    }
    requestDraftInitialization?: (
      binding: unknown,
      options: {
        readonly prompt?: string
        readonly clearPreviousDraft?: boolean
        readonly whenDraftExists?: 'replace' | 'append' | 'keep'
      },
    ) => 'applied' | 'preserved' | 'blocked'
  }
}

function isDefaultWorkspaceCandidate(workspace: HostWorkspaceView): boolean {
  if (workspace.title.trim().toLowerCase() === DEFAULT_WORKSPACE_DIRECTORY) return true
  const normalized = workspace.path.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
  return normalized.endsWith(`/deepseek-harness/${DEFAULT_WORKSPACE_DIRECTORY}`)
    || normalized.endsWith(`/${DEFAULT_WORKSPACE_DIRECTORY}`)
}

/** Resolve the Host default workspace id, initializing it when eligible. */
export async function resolveDefaultWorkspaceId(
  workspaces: HostWorkspacesService | undefined,
): Promise<string | undefined> {
  if (!workspaces) return undefined
  if (typeof workspaces.initializeDefault === 'function') {
    try {
      const initialized = await workspaces.initializeDefault()
      if (initialized?.workspaceId) return initialized.workspaceId
    } catch {
      // Fall back to already-registered workspaces if initialization fails or is denied.
    }
  }
  const items = workspaces.list?.getSnapshot().items ?? []
  return items.find(isDefaultWorkspaceCandidate)?.workspaceId
}

function scheduleComposerFocus(
  sessions: ISessions,
  conversation: HostConversationService,
  sessionId: SessionId,
): void {
  const focus = (): void => {
    try {
      const scope = sessions.scope(sessionId)
      if (scope) conversation.input?.for?.(scope).focus?.()
    } catch { /* ignore focus errors when another navigation supersedes */ }
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => focus())
  } else {
    queueMicrotask(focus)
  }
}

function normalizeDraftText(text: string): string {
  return text.replace(/\r\n?/gu, '\n').trim()
}

function isCustomDirectorDraft(existingDraft: string, defaultPrompt: string): boolean {
  const normalized = normalizeDraftText(existingDraft)
  if (!normalized.startsWith(STUDIO_DIRECTOR_SLASH_COMMAND)) return false
  const rest = normalized.slice(STUDIO_DIRECTOR_SLASH_COMMAND.length)
  if (!/^\s/u.test(rest) || rest.trim().length === 0) return false
  if (normalized === normalizeDraftText(defaultPrompt)) return false
  if (normalized === normalizeDraftText(STUDIO_DIRECTOR_DRAFT_INPUT)) return false
  return true
}

/**
 * Open a conversation in the Host's default workspace and prefill `/director `
 * with guided story element prompts so the user can fill in key details or let
 * DSH ask clarifying questions.
 */
export async function launchStudioDirectorSession(
  ctx: Context,
  options?: LaunchStudioDirectorOptions,
): Promise<boolean> {
  const uiWorkspace = ctx.get('uiWorkspace' as never) as HostUiWorkspaceService | undefined
  if (!uiWorkspace) return false

  const workspaces = ctx.get('workspaces' as never) as HostWorkspacesService | undefined
  const sessions = ctx.get('sessions' as never) as ISessions | undefined
  const conversation = ctx.get('conversation' as never) as HostConversationService | undefined

  const targetWorkspaceId = await resolveDefaultWorkspaceId(workspaces)
  const prompt = options?.prompt ?? STUDIO_DIRECTOR_DRAFT_INPUT

  if (
    targetWorkspaceId
    && typeof uiWorkspace.openWorkspace === 'function'
    && sessions
    && typeof conversation?.input?.requestDraftInitialization === 'function'
  ) {
    await uiWorkspace.openWorkspace(targetWorkspaceId, (sessionId) => {
      const binding = sessions.binding(sessionId)
      if (!binding) return
      const scope = sessions.scope(sessionId)
      const existingDraft = scope && conversation.input?.for
        ? conversation.input.for(scope).state?.getSnapshot().draft ?? ''
        : ''
      if (!isCustomDirectorDraft(existingDraft, prompt)) {
        conversation.input?.requestDraftInitialization?.(binding, {
          prompt,
          whenDraftExists: 'replace',
        })
      }
      scheduleComposerFocus(sessions, conversation, sessionId)
    })
    return true
  }

  if (typeof uiWorkspace.startSession === 'function') {
    uiWorkspace.startSession(targetWorkspaceId, {
      prompt,
      whenDraftExists: 'replace',
    })
    return true
  }

  return false
}
