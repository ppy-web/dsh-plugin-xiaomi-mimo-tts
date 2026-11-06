import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Translate } from '../localization.js'
import { briefText, observeCurrentSession, type CollectorOptions } from './host-source.js'

/** Read-only subset of dsh-api-job-controller's IJobs; no output streams or actions. */
export interface AnnouncementJobs {
  state: {
    getSnapshot(): { rows: Readonly<Record<string, readonly { id: string; owner?: string; label: string; status: string }[]>> }
    subscribe(listener: () => void): () => void
  }
  watchRows(sessionId: string): () => void
}

export function observeJobs(sessions: Pick<ISessions, 'list'>, jobs: AnnouncementJobs, t: Translate,
  { signal, emit }: CollectorOptions): () => void {
  return observeCurrentSession(sessions, sessionId => {
    const lifetime = new AbortController()
    let previous = new Map<string, string>()
    const scan = () => {
      const rows = jobs.state.getSnapshot().rows[sessionId] ?? []
      const next = new Map<string, string>()
      for (const job of rows) {
        if (job.owner !== sessionId || !job.id) continue
        next.set(job.id, job.status)
        const wasLive = ['running', 'stopping'].includes(previous.get(job.id) ?? '')
        if (!wasLive || !['completed', 'failed', 'killed'].includes(job.status) || signal.aborted) continue
        // Advance before emitting: busy messages are intentionally never retried.
        previous.set(job.id, job.status)
        const result = job.status === 'completed' ? t('announcements.jobCompleted')
          : job.status === 'failed' ? t('announcements.jobFailed') : t('announcements.jobKilled')
        emit({ source: 'job-results', id: JSON.stringify([sessionId, job.id]),
          important: job.status === 'failed',
          text: `${briefText(job.label) || t('announcements.job')}: ${result}`,
          signal: AbortSignal.any([signal, lifetime.signal]) })
      }
      previous = next
    }
    const off = jobs.state.subscribe(scan)
    const unwatch = jobs.watchRows(sessionId)
    scan()
    return () => { lifetime.abort(); off(); unwatch() }
  })
}
