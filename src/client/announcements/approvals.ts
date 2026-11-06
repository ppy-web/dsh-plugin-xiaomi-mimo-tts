import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiSession } from '@deepseek-ai/dsh-client-ui-session/client'
import type { Translate } from '../localization.js'
import { briefText, observeCurrentSession, type CollectorOptions } from './host-source.js'

/** Read the UI's pending projection; never register an approval waterfall listener. */
export function observeApprovals(sessions: Pick<ISessions, 'list'>, uiSession: Pick<UiSession, 'sessionStatus'>, t: Translate,
  { signal, emit }: CollectorOptions): () => void {
  return observeCurrentSession(sessions, sessionId => {
    const seen = new Set<string>()
    let current: { key: string; controller: AbortController } | undefined
    const cancel = () => { current?.controller.abort(); current = undefined }
    const scan = (baseline = false) => {
      const pending = uiSession.sessionStatus.getSnapshot().get(sessionId)?.pendingInteraction
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
    const off = uiSession.sessionStatus.subscribe(() => scan())
    scan(true)
    return () => { off(); cancel() }
  })
}
