import type { ClientContextCompat } from '../dsh-compat.js'
import type { SoundEffectsController, SoundEffectsSettings } from './types.js'

interface SessionSnapshot { running?: boolean; pending?: unknown[]; lastAgentError?: unknown }
interface SessionBinding { session: { getSnapshot(): SessionSnapshot; subscribe(listener: () => void): () => void } }
interface SessionsCompat {
  list: { getSnapshot(): { current?: string | null }; subscribe(listener: () => void): () => void }
  binding(id: string): SessionBinding | undefined
}

function hasTurnError(): boolean {
  return typeof document !== 'undefined' && document.querySelector("[data-chat-flow-kind='turn-error']") !== null
}

export function installTaskSoundWatcher(ctx: ClientContextCompat, controller: SoundEffectsController, getSettings: () => SoundEffectsSettings): () => void {
  const sessions = (ctx as unknown as { sessions?: SessionsCompat }).sessions
  if (sessions === undefined) return () => {}
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
    const pending = Array.isArray(snapshot.pending) ? snapshot.pending.length : 0
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
