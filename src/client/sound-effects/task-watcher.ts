import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SoundEffectsController, SoundEffectsSettings } from './types.js'
import { latestTurn } from '../conversation/turn-state.js'

export function installTaskSoundWatcher(ctx: Context, controller: SoundEffectsController, getSettings: () => SoundEffectsSettings): () => void {
  const sessions = (ctx as unknown as { readonly sessions: ISessions }).sessions
  let watchedId: string | undefined
  let offSession = () => {}
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const play = (sound: 'start' | 'complete' | 'error' | 'stop' | 'queued'): void => {
    const settings = getSettings()
    if (settings.enabled && settings.taskSounds) controller.play(sound)
  }
  const watchCurrent = (): void => {
    const list = sessions.list.getSnapshot()
    const id = list.phase === 'ready' ? Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id : undefined
    if (id === watchedId) return
    offSession()
    offSession = () => {}
    watchedId = undefined
    clearTimeout(retryTimer)
    if (id === undefined) return
    const binding = sessions.binding(id)
    if (binding === undefined) { retryTimer = setTimeout(watchCurrent, 200); return }
    watchedId = id
    const chat = ctx.uiConversation.binding(binding).target('chat')
    let lastRunning = binding.session.getSnapshot().running
    let lastPending = binding.session.getSnapshot().pendingSubmissions.filter(row => row.placement !== 'transcript').length
    let baselineTurn = latestTurn(chat.getSnapshot())?.turn ?? -1
    let activeTurn = lastRunning && latestTurn(chat.getSnapshot())?.status === 'open' ? baselineTurn : undefined
    let observedRun = lastRunning
    const tick = (): void => {
      const snapshot = binding.session.getSnapshot()
      const turn = latestTurn(chat.getSnapshot())
      const pending = snapshot.pendingSubmissions.filter(row => row.placement !== 'transcript').length
      if (snapshot.running && !lastRunning) {
        play('start')
        observedRun = true
        baselineTurn = turn?.end ? turn.turn : (turn?.turn ?? 0) - 1
        activeTurn = undefined
      }
      if (observedRun && turn && (turn.status === 'open' || turn.turn > baselineTurn)) activeTurn = turn.turn
      if (!snapshot.running && observedRun && turn && turn.turn === activeTurn && turn.end) {
        observedRun = false
        activeTurn = undefined
        const reason = turn.end.data.reason.kind
        if (reason === 'completed') play('complete')
        else if (reason === 'error' || reason === 'blocked' || reason === 'max-tokens') play('error')
        else if (reason === 'aborted' || reason === 'interrupted') play('stop')
      }
      if (pending > lastPending) play('queued')
      lastRunning = snapshot.running
      lastPending = pending
    }
    const offState = binding.session.subscribe(tick)
    const offChat = chat.subscribe(tick)
    offSession = () => { offState(); offChat() }
  }
  const offList = sessions.list.subscribe(watchCurrent)
  watchCurrent()
  return () => { offList(); offSession(); clearTimeout(retryTimer) }
}
