import { useSyncExternalStore } from 'react'
import type { StudioLine, StudioRoleProvider, StudioScript } from '../../shared.js'
import { STUDIO_MAX_SCRIPT_TITLE_LENGTH } from '../../types/studio.js'

export type StudioTabId = 'scripts' | 'roles' | 'tasks'

export interface StudioRoleDraft {
  id?: string
  name: string
  color: string
  provider: StudioRoleProvider
  model: string
  voice: string
  voiceDesignPrompt: string
  speechInstruction: string
  voiceRate: number
}

export interface StudioScriptDraft {
  draftId?: string
  selectedId: string
  title: string
  description: string
  lines: StudioLine[]
  editorMode: 'blocks' | 'text'
  rawText: string
  textDirty: boolean
  dirty: boolean
  syncedUpdatedAt: number | null
}

export interface StudioTaskPlaybackBookmark {
  activeTaskId: string | null
  currentTime: number
}

export interface StudioWorkspaceState {
  openTab: StudioTabId | null
  script: StudioScriptDraft
  scriptDrafts: StudioScriptDraft[]
  scriptOperation: 'save' | 'record' | 'delete' | null
  roleDraft: StudioRoleDraft | null
  playback: StudioTaskPlaybackBookmark
}

const STORAGE_KEY = 'dsh-xiaomi-tts:studio-workspace-v1'
const COPY_TITLE_SUFFIX = /(?: -副本| - Copy )([1-9]\d*)$/u

function fitScriptTitle(title: string, suffixLength: number): string {
  return title.slice(0, STUDIO_MAX_SCRIPT_TITLE_LENGTH - suffixLength).replace(/[\uD800-\uDBFF]$/u, '').trimEnd()
}

export function studioScriptCopyTitle(title: string, existingTitles: readonly string[], suffixTemplate: string): string {
  const base = title.replace(COPY_TITLE_SUFFIX, '').trimEnd()
  let number = 0
  for (const existing of [title, ...existingTitles]) {
    const match = COPY_TITLE_SUFFIX.exec(existing)
    if (!match || existing.slice(0, match.index) !== fitScriptTitle(base, match[0].length)) continue
    const index = Number(match[1])
    if (Number.isSafeInteger(index + 1)) number = Math.max(number, index)
  }
  const suffix = suffixTemplate.replace('{n}', String(number + 1))
  return fitScriptTitle(base, suffix.length) + suffix
}

export function studioScriptHasEdits(draft: StudioScriptDraft, saved: StudioScript): boolean {
  if (!draft.dirty) return false
  if (draft.editorMode === 'text' && draft.textDirty) return true
  if (draft.title !== saved.title || draft.description !== (saved.description ?? '')) return true
  return draft.lines.length !== saved.lines.length || draft.lines.some((line, index) => {
    const original = saved.lines[index]!
    return line.id !== original.id || line.roleId !== original.roleId || line.text !== original.text
      || line.speechInstruction !== original.speechInstruction || line.pauseAfterMs !== original.pauseAfterMs
  })
}

function createInitialScriptDraft(): StudioScriptDraft {
  return {
    selectedId: '',
    title: '',
    description: '',
    lines: [],
    editorMode: 'blocks',
    rawText: '',
    textDirty: false,
    dirty: false,
    syncedUpdatedAt: null,
  }
}

function createInitialState(): StudioWorkspaceState {
  return {
    openTab: null,
    script: createInitialScriptDraft(),
    scriptDrafts: [],
    scriptOperation: null,
    roleDraft: null,
    playback: { activeTaskId: null, currentTime: 0 },
  }
}

function isTabId(value: unknown): value is StudioTabId {
  return value === 'scripts' || value === 'roles' || value === 'tasks'
}

function sanitizeLine(value: unknown): StudioLine | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.roleId !== 'string' || typeof raw.text !== 'string') return null
  const pauseAfterMs = typeof raw.pauseAfterMs === 'number' && Number.isFinite(raw.pauseAfterMs)
    ? Math.max(0, Math.min(5000, Math.round(raw.pauseAfterMs)))
    : 400
  return {
    id: raw.id,
    roleId: raw.roleId,
    text: raw.text,
    ...(typeof raw.speechInstruction === 'string' && raw.speechInstruction ? { speechInstruction: raw.speechInstruction } : {}),
    pauseAfterMs,
  }
}

function sanitizeRoleDraft(value: unknown): StudioRoleDraft | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.name !== 'string' || typeof raw.color !== 'string' || typeof raw.provider !== 'string'
    || typeof raw.model !== 'string' || typeof raw.voice !== 'string') return null
  return {
    ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
    name: raw.name,
    color: raw.color,
    provider: raw.provider as StudioRoleProvider,
    model: raw.model,
    voice: raw.voice,
    voiceDesignPrompt: typeof raw.voiceDesignPrompt === 'string' ? raw.voiceDesignPrompt : '',
    speechInstruction: typeof raw.speechInstruction === 'string' ? raw.speechInstruction : '',
    voiceRate: typeof raw.voiceRate === 'number' && Number.isFinite(raw.voiceRate) ? raw.voiceRate : 1,
  }
}

export function studioScriptKey(script: StudioScriptDraft): string {
  return script.selectedId || script.draftId || ''
}

function withDraftId(script: StudioScriptDraft): StudioScriptDraft {
  if (!script.dirty || studioScriptKey(script)) return script
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { ...script, draftId: `draft:${id}` }
}

function sanitizeScriptDraft(value: unknown): StudioScriptDraft | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<StudioScriptDraft>
  if (raw.dirty !== true) return null
  const rawText = typeof raw.rawText === 'string' ? raw.rawText : ''
  return withDraftId({
    ...(typeof raw.draftId === 'string' && raw.draftId ? { draftId: raw.draftId } : {}),
    selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    lines: Array.isArray(raw.lines) ? raw.lines.map(sanitizeLine).filter((line): line is StudioLine => line !== null) : [],
    editorMode: raw.editorMode === 'text' ? 'text' : 'blocks',
    rawText,
    textDirty: typeof raw.textDirty === 'boolean' ? raw.textDirty : rawText.length > 0,
    dirty: true,
    syncedUpdatedAt: typeof raw.syncedUpdatedAt === 'number' && Number.isFinite(raw.syncedUpdatedAt) ? raw.syncedUpdatedAt : null,
  })
}

function loadPersistedState(): StudioWorkspaceState {
  if (typeof sessionStorage === 'undefined') return createInitialState()
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as Partial<StudioWorkspaceState> | null
    if (!parsed || typeof parsed !== 'object') return createInitialState()
    const script = sanitizeScriptDraft(parsed.script) ?? createInitialScriptDraft()
    const scriptDrafts = new Map<string, StudioScriptDraft>()
    if (Array.isArray(parsed.scriptDrafts)) {
      for (const item of parsed.scriptDrafts) {
        const draft = sanitizeScriptDraft(item)
        if (draft && studioScriptKey(draft) !== studioScriptKey(script)) scriptDrafts.set(studioScriptKey(draft), draft)
      }
    }
    const playbackRaw = parsed.playback as Partial<StudioTaskPlaybackBookmark> | undefined
    const playback: StudioTaskPlaybackBookmark = {
      activeTaskId: typeof playbackRaw?.activeTaskId === 'string' ? playbackRaw.activeTaskId : null,
      currentTime: typeof playbackRaw?.currentTime === 'number' && Number.isFinite(playbackRaw.currentTime) && playbackRaw.currentTime >= 0
        ? playbackRaw.currentTime
        : 0,
    }
    return {
      openTab: isTabId(parsed.openTab) ? parsed.openTab : null,
      script,
      scriptDrafts: [...scriptDrafts.values()],
      scriptOperation: null,
      roleDraft: sanitizeRoleDraft(parsed.roleDraft),
      playback,
    }
  } catch {
    return createInitialState()
  }
}

function persistState(next: StudioWorkspaceState): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      openTab: next.openTab,
      script: next.script.dirty ? next.script : createInitialScriptDraft(),
      scriptDrafts: next.scriptDrafts,
      roleDraft: next.roleDraft,
      playback: next.playback,
    }))
  } catch { /* ignore storage quota or private mode failures */ }
}

let state: StudioWorkspaceState = loadPersistedState()
const listeners = new Set<() => void>()

function commit(next: StudioWorkspaceState, persist = true): void {
  if (next === state) return
  state = next
  if (persist) persistState(next)
  for (const listener of listeners) listener()
}

function hostScriptDraft(script: StudioScript, rawText: string, editorMode: StudioScriptDraft['editorMode']): StudioScriptDraft {
  return {
    ...createInitialScriptDraft(),
    selectedId: script.id,
    title: script.title,
    description: script.description ?? '',
    lines: script.lines,
    editorMode,
    rawText,
    syncedUpdatedAt: script.updatedAt,
  }
}

function switchScript(next: StudioScriptDraft): void {
  if (state.scriptOperation || studioScriptKey(next) === studioScriptKey(state.script)) return
  const scriptDrafts = state.scriptDrafts.filter(draft => studioScriptKey(draft) !== studioScriptKey(next))
  if (state.script.dirty) scriptDrafts.unshift(state.script)
  commit({ ...state, script: next, scriptDrafts })
}

export const studioWorkspaceStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot(): StudioWorkspaceState {
    return state
  },
  getOpenTab(): StudioTabId | null {
    return state.openTab
  },
  setOpenTab(tab: StudioTabId | null, keepScript = false): void {
    if (state.openTab === tab) return
    const script = tab === null && !keepScript && !state.scriptOperation && !state.script.dirty ? createInitialScriptDraft() : state.script
    commit({ ...state, openTab: tab, script })
  },
  updateScript(updater: (current: StudioScriptDraft) => StudioScriptDraft): void {
    if (state.scriptOperation) return
    const nextScript = updater(state.script)
    if (nextScript === state.script) return
    commit({ ...state, script: withDraftId(nextScript) })
  },
  newScript(title: string, mode: StudioScriptDraft['editorMode'], lines: StudioLine[]): void {
    const draft = withDraftId({ ...createInitialScriptDraft(), title, lines, editorMode: mode, dirty: true })
    switchScript({ ...draft, dirty: false })
  },
  openScript(script: StudioScript, rawText: string, mode: StudioScriptDraft['editorMode']): void {
    const draft = state.scriptDrafts.find(item => item.selectedId === script.id)
    switchScript(draft ?? hostScriptDraft(script, rawText, mode))
  },
  openScriptDraft(id: string): void {
    const draft = state.scriptDrafts.find(item => studioScriptKey(item) === id)
    if (draft) switchScript(draft)
  },
  setScriptMode(mode: StudioScriptDraft['editorMode'], blocksAsText = ''): void {
    this.updateScript(draft => ({
      ...draft,
      editorMode: mode,
      rawText: mode === 'text' && !draft.textDirty ? blocksAsText : draft.rawText,
    }))
  },
  syncScriptFromHost(script: StudioScript | null, rawText = '', options: { keepMode?: boolean; keepTextDraft?: boolean } = {}): void {
    if (!script) {
      commit({ ...state, script: createInitialScriptDraft() })
      return
    }
    const keepText = options.keepTextDraft && state.script.textDirty
    const next = hostScriptDraft(script, keepText ? state.script.rawText : rawText, options.keepMode ? state.script.editorMode : 'blocks')
    commit({ ...state, script: keepText ? { ...next, dirty: true, textDirty: true } : next })
  },
  beginScriptOperation(operation: NonNullable<StudioWorkspaceState['scriptOperation']>): boolean {
    if (state.scriptOperation) return false
    commit({ ...state, scriptOperation: operation }, false)
    return true
  },
  endScriptOperation(): void {
    commit({ ...state, scriptOperation: null }, false)
  },
  setRoleDraft(draft: StudioRoleDraft | null): void {
    if (state.roleDraft === draft) return
    commit({ ...state, roleDraft: draft })
  },
  setPlaybackBookmark(activeTaskId: string | null, currentTime: number, persist = false): void {
    const safeTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0
    if (state.playback.activeTaskId === activeTaskId && Math.abs(state.playback.currentTime - safeTime) < 0.05) return
    commit({ ...state, playback: { activeTaskId, currentTime: safeTime } }, persist)
  },
  reset(): void {
    state = createInitialState()
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    }
    for (const listener of listeners) listener()
  },
}

export function useStudioOpenTab(): StudioTabId | null {
  return useSyncExternalStore(studioWorkspaceStore.subscribe, studioWorkspaceStore.getOpenTab, studioWorkspaceStore.getOpenTab)
}

export function useStudioWorkspaceState(): StudioWorkspaceState {
  return useSyncExternalStore(
    studioWorkspaceStore.subscribe,
    studioWorkspaceStore.getSnapshot,
    studioWorkspaceStore.getSnapshot,
  )
}
