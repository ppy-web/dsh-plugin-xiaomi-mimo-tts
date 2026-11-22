import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { Translate } from '../localization.js'
import { briefText, observeCurrentSession, type CollectorOptions } from './host-source.js'

export interface ApprovalObservable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface ApprovalUiSession {
  readonly pendingInteractions?: ApprovalObservable<{ get(sessionId: never): SessionPendingInteraction | undefined }>
  readonly sessionStatus?: ApprovalObservable<{ get(sessionId: never): { readonly pendingInteraction?: SessionPendingInteraction | undefined } | undefined }>
}

/** Read the UI's pending projection; never register an approval waterfall listener. */
export function observeApprovals(sessions: Pick<ISessions, 'list'>, uiSession: ApprovalUiSession, t: Translate,
  { signal, emit }: CollectorOptions): () => void {
  const source = uiSession.pendingInteractions
    ? {
      read: (sessionId: string) => (uiSession.pendingInteractions!.getSnapshot() as ReadonlyMap<string, SessionPendingInteraction>).get(sessionId),
      subscribe: (listener: () => void) => uiSession.pendingInteractions!.subscribe(listener),
    }
    : uiSession.sessionStatus
      ? {
        read: (sessionId: string) => (uiSession.sessionStatus!.getSnapshot() as ReadonlyMap<string, { readonly pendingInteraction?: SessionPendingInteraction }>).get(sessionId)?.pendingInteraction,
        subscribe: (listener: () => void) => uiSession.sessionStatus!.subscribe(listener),
      }
      : undefined
  if (!source) return () => {}
  return observeCurrentSession(sessions, sessionId => {
    const seen = new Set<string>()
    let current: { key: string; controller: AbortController } | undefined
    const cancel = () => { current?.controller.abort(); current = undefined }
    const scan = (baseline = false) => {
      const pending = source.read(sessionId)
      const approval = pending?.kind === 'approval' ? pending : undefined
      if (current?.key !== approval?.key) cancel()
      if (!approval || seen.has(approval.key) || signal.aborted) return
      seen.add(approval.key)
      if (baseline) return
      const reason = briefText((approval as unknown as { reason?: unknown }).reason)
      current = { key: approval.key, controller: new AbortController() }
      emit({ source: 'approvals', id: JSON.stringify([sessionId, approval.key]),
        important: true,
        text: reason ? `${t('announcements.approval')} ${reason}` : t('announcements.approval'),
        signal: AbortSignal.any([signal, current.controller.signal]) })
    }
    const off = source.subscribe(() => scan())
    scan(true)
    return () => { off(); cancel() }
  })
}
