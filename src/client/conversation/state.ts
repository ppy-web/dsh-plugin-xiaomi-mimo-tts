export interface LegacyConversationNodeCompat {
  readonly kind: string
  readonly messageId?: string
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  readonly turn: number
  readonly step: number
  readonly time: number
  readonly interrupted?: true
}

export interface LegacyConversationSliceCompat {
  readonly nodes: readonly LegacyConversationNodeCompat[]
  readonly partial: {
    readonly turn: number
    readonly step: number
    readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  } | null
}

export interface SessionSnapshotCompat {
  readonly running?: boolean
  readonly nodes?: unknown
  readonly partial?: unknown
}

export interface ChatSnapshotCompat {
  readonly legacy: LegacyConversationSliceCompat
}

export interface ConversationCompatState {
  readonly legacy: LegacyConversationSliceCompat
  readonly running: boolean
}

export const EMPTY_LEGACY_CONVERSATION: LegacyConversationSliceCompat = Object.freeze({
  nodes: Object.freeze([]),
  partial: null,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLegacyConversation(value: unknown): value is LegacyConversationSliceCompat {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return false
  return value.partial === null || isRecord(value.partial)
}

function runningFrom(value: unknown): boolean | undefined {
  return isRecord(value) && typeof value.running === 'boolean' ? value.running : undefined
}

/** Normalize the old ConversationSnapshot and the new ChatSnapshot without version checks. */
export function resolveConversationCompatState(
  chatLegacy: unknown,
  sessionSnapshot: unknown,
  ownerSession: unknown,
): ConversationCompatState {
  const legacy = isLegacyConversation(chatLegacy)
    ? chatLegacy
    : isLegacyConversation(sessionSnapshot)
      ? sessionSnapshot
      : isLegacyConversation(ownerSession)
        ? ownerSession
        : EMPTY_LEGACY_CONVERSATION

  return {
    legacy,
    running: runningFrom(sessionSnapshot) ?? runningFrom(ownerSession) ?? false,
  }
}
