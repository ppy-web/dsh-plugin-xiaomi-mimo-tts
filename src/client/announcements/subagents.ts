import type { Translate } from '../localization.js'
import { briefText, type CollectorOptions } from './host-source.js'

interface SubagentFacts {
  subagentCatalog?: readonly { id: string; mode: string; label?: string; name?: string }[]
  subagentTiming?: { settledMs: number; active?: { since: number; through: number }; lastTurnCompleted?: boolean }
}

/** Read-only Host summary face: no child sessions are retained or opened for speech. */
export interface AnnouncementSubagentSessions {
  list: {
    getSnapshot(): {
      phase: string
      byId: Readonly<Record<string, {
        id: string
        parentId?: string
        origin?: 'subagent'
        running: boolean
        retainedBy: Readonly<Partial<Record<string, number>>>
        projectionValues?: SubagentFacts
      }>>
      projectionsBySession?: Readonly<Record<string, { state: string; values: SubagentFacts }>>
    }
    subscribe(listener: () => void): () => void
  }
}

export function observeSubagents(sessions: AnnouncementSubagentSessions, t: Translate, { signal, emit }: CollectorOptions): () => void {
  let current: string | undefined
  let lifetime = new AbortController()
  const observed = new Map<string, { armed: boolean; sawActive: boolean; before: string; run: number }>()
  const scan = (): void => {
    if (signal.aborted) return
    const list = sessions.list.getSnapshot()
    const root = list.phase === 'ready' ? Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id : undefined
    if (root !== current) {
      lifetime.abort()
      lifetime = new AbortController()
      observed.clear()
      current = root
    }
    if (root === undefined) return
    const facts = (id: string): SubagentFacts | undefined => {
      const projection = list.projectionsBySession?.[id]
      return projection?.state === 'ready' ? projection.values : list.byId[id]?.projectionValues
    }
    const childrenByParent = new Map<string, (typeof list.byId)[string][]>()
    for (const row of Object.values(list.byId)) {
      if (row.origin !== 'subagent' || row.parentId === undefined) continue
      const siblings = childrenByParent.get(row.parentId) ?? []
      siblings.push(row)
      childrenByParent.set(row.parentId, siblings)
    }
    const paths = new Map<string, string[]>([[root, []]])
    for (const [parent, path] of paths) {
      const catalog = new Map((facts(parent)?.subagentCatalog ?? []).map(entry => [entry.id, entry]))
      for (const child of childrenByParent.get(parent) ?? []) {
        if (paths.has(child.id)) continue
        const entry = catalog.get(child.id)
        const name = briefText(entry?.name)
        const label = briefText(entry?.label)
        const title = name && label && name !== label ? `${name} · ${label}` : name || label || t('announcements.subagent')
        paths.set(child.id, [...path, title])
      }
    }
    for (const id of observed.keys()) if (!paths.has(id)) observed.delete(id)
    for (const [id, path] of paths) {
      if (id === root) continue
      const row = list.byId[id]
      const timing = facts(id)?.subagentTiming
      const live = row?.running === true || timing?.active !== undefined
      const closed = timing?.lastTurnCompleted
      const token = JSON.stringify([timing?.settledMs, closed])
      let state = observed.get(id)
      if (state === undefined) {
        state = { armed: live, sawActive: timing?.active !== undefined, before: token, run: live ? 1 : 0 }
        observed.set(id, state)
        continue
      }
      if (live) {
        if (!state.armed) { state.before = token; state.run++ }
        state.armed = true
        state.sawActive ||= timing?.active !== undefined
        continue
      }
      if (!state.armed || closed === undefined || (!state.sawActive && token === state.before)) continue
      state.armed = false
      state.sawActive = false
      state.before = token
      emit({ source: 'subagent-results', id: JSON.stringify([root, id, state.run, token]),
        text: `${briefText(path.join(' / '))}: ${t(closed ? 'announcements.subagentCompleted' : 'announcements.subagentStopped')}`,
        signal: AbortSignal.any([signal, lifetime.signal]) })
    }
  }
  const off = sessions.list.subscribe(scan)
  scan()
  return () => { off(); lifetime.abort(); observed.clear() }
}
