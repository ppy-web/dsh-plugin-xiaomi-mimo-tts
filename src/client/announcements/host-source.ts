import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AnnouncementCollector } from './types.js'

export type CollectorOptions = Parameters<AnnouncementCollector['start']>[0]

/** Optional services must not prevent speech from loading on older hosts. */
export function hostCollector(ctx: Context, id: AnnouncementCollector['id'], service: string,
  observe: (child: Context, options: CollectorOptions) => () => void): AnnouncementCollector {
  return { id, async start(options) {
    if (options.signal.aborted) return
    const fiber = ctx.inject([...new Set(['sessions', service])], child => {
      child.effect(() => {
        if (options.signal.aborted) return () => {}
        const controller = new AbortController()
        const off = observe(child, { ...options, signal: AbortSignal.any([options.signal, controller.signal]) })
        return () => { controller.abort(); off() }
      }, `xiaomi-mimo-tts: ${id}`)
    })
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        options.signal.removeEventListener('abort', stop)
        try {
          // Synchronous cleanup and an already disposed fiber can return void.
          void Promise.resolve(fiber.dispose()).then(resolve, reject)
        } catch (error) {
          reject(error)
        }
      }
      options.signal.addEventListener('abort', stop, { once: true })
      if (options.signal.aborted) stop()
    })
  } }
}

/** Observe only the main conversation without retaining or opening other sessions. */
export function observeCurrentSession(sessions: Pick<ISessions, 'list'>, observe: (id: SessionId) => () => void): () => void {
  let current: SessionId | undefined
  let off: (() => void) | undefined
  const update = () => {
    const list = sessions.list.getSnapshot()
    const id = list.phase === 'ready' ? Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id : undefined
    if (id === current) return
    current = id
    off?.()
    off = id === undefined ? undefined : observe(id)
  }
  const unsubscribe = sessions.list.subscribe(update)
  update()
  return () => { unsubscribe(); off?.() }
}

export const briefText = (value: unknown): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
