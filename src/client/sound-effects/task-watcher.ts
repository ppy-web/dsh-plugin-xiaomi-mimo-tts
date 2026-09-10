import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SoundEffectsController, SoundEffectsSettings } from './types.js'

function hasTurnError(): boolean {
  return typeof document !== 'undefined' && document.querySelector("[data-chat-flow-kind='turn-error']") !== null
}

export function installTaskSoundWatcher(ctx: Context, controller: SoundEffectsController, getSettings: () => SoundEffectsSettings): () => void {
  const sessions = (ctx as unknown as { readonly sessions: ISessions }).sessions
  let watchedId: string | null | undefined
  let sessionOff: (() => void) | null = null
  let listOff: (() => void) | null = null
  let retryTimer: number | null = null
  let lastRunning: boolean | null = null
  let lastPending = 0

  const unbind = (): void => { sessionOff?.(); sessionOff = null }
  const tick = (snapshot: SessionSnapshot): void => {
    const settings = getSettings()
    if (!settings.enabled || !settings.taskSounds) return
    const running = snapshot.running === true
    const pending = snapshot.queue.length + snapshot.pendingSubmissions.length
    if (lastRunning === null) { lastRunning = running; lastPending = pending; return }
    if (running && !lastRunning) controller.play('start')
    if (!running && lastRunning) {
      const failed = snapshot.lastAgentError != null || hasTurnError()
      window.setTimeout(() => { if (getSettings().enabled && getSettings().taskSounds) controller.play(failed ? 'error' : 'complete') }, 50)
    }
    if (pending > lastPending) controller.play('queued')
    lastRunning = running
    lastPending = pending
  }
  const watchCurrent = (): void => {
    const id = sessions.list.getSnapshot().current
    if (id === watchedId) return
    watchedId = id
    unbind()
    lastRunning = null
    lastPending = 0
    if (retryTimer !== null) { window.clearTimeout(retryTimer); retryTimer = null }
    if (id === undefined || id === null) return
    const binding = sessions.binding(id)
    if (binding === undefined) { retryTimer = window.setTimeout(watchCurrent, 200); return }
    sessionOff = binding.session.subscribe(() => tick(binding.session.getSnapshot()))
    tick(binding.session.getSnapshot())
  }

  listOff = sessions.list.subscribe(watchCurrent)
  watchCurrent()
  return () => {
    listOff?.()
    unbind()
    if (retryTimer !== null) window.clearTimeout(retryTimer)
  }
}
