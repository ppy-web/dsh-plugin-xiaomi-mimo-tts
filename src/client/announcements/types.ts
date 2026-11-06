import type { AnnouncementSourceId } from '../../types/settings.js'
export type { AnnouncementSourceId } from '../../types/settings.js'

export interface Announcement {
  source: AnnouncementSourceId
  id: string
  text: string
  /** Approval requests and failed background jobs may preempt ordinary speech. */
  important?: boolean
  /** Optional lifetime, used by transient UI sources such as question cards. */
  signal?: AbortSignal
}

export interface AnnouncementCollector {
  id: AnnouncementSourceId
  start(options: { signal: AbortSignal; emit: (event: Announcement) => void }): Promise<void>
}
