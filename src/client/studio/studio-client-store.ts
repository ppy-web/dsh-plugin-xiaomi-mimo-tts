import { useSyncExternalStore } from 'react'
import {
  STUDIO_DEFAULT_PAUSE_MS,
  STUDIO_MAX_STORAGE_BYTES,
  TTS_DESKTOP_WRITE_HEADER,
  TTS_STUDIO_AUDIO_ROUTE,
  TTS_STUDIO_EVENTS_ROUTE,
  TTS_STUDIO_ROLES_ROUTE,
  TTS_STUDIO_SCRIPTS_ROUTE,
  TTS_STUDIO_STATE_ROUTE,
  TTS_STUDIO_TASKS_ROUTE,
  createBuiltinStudioRoles,
  pickStudioRoleColor,
} from '../../shared.js'
import { STUDIO_BUILTIN_CATALOG_VERSION, createBuiltinStudioScripts, migrateBuiltinStudioPresets } from '../../studio-presets.js'
import type {
  StudioLineInput,
  StudioRole,
  StudioRoleInput,
  StudioScript,
  StudioScriptInput,
  StudioSnapshot,
  StudioTask,
} from '../../shared.js'
import { materializeStudioScript, StudioScriptParseError } from '../../text/studio-script-parser.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'

export interface StudioClientView extends StudioSnapshot {
  status: 'loading' | 'ready' | 'demo' | 'error'
  errorCode: string | null
}

const DEMO_STORAGE_KEY = 'dsh-xiaomi-tts:studio-demo-v2'

function createInitialDemoSnapshot(): StudioSnapshot {
  const now = Date.now()
  return {
    revision: 1,
    roles: createBuiltinStudioRoles(now),
    scripts: createBuiltinStudioScripts(now),
    tasks: [],
    storageBytes: 0,
    maxStorageBytes: STUDIO_MAX_STORAGE_BYTES,
  }
}

let state: StudioClientView = {
  revision: 0,
  roles: [],
  scripts: [],
  tasks: [],
  storageBytes: 0,
  maxStorageBytes: STUDIO_MAX_STORAGE_BYTES,
  status: 'loading',
  errorCode: null,
}

const listeners = new Set<() => void>()
let eventSource: EventSource | null = null
let stateRequest: AbortController | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
let demoSimTimer: number | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function saveDemoSnapshot(snap: StudioSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...snap, builtinCatalogVersion: STUDIO_BUILTIN_CATALOG_VERSION }))
  } catch { /* ignore storage quota in preview */ }
}

function loadDemoSnapshot(): StudioSnapshot {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StudioSnapshot> & { builtinCatalogVersion?: number }
        if (Array.isArray(parsed.roles) && Array.isArray(parsed.scripts) && Array.isArray(parsed.tasks)) {
          const previousCatalogVersion = parsed.builtinCatalogVersion ?? 0
          const { roles, scripts } = previousCatalogVersion < STUDIO_BUILTIN_CATALOG_VERSION
            ? migrateBuiltinStudioPresets(parsed.roles, parsed.scripts, previousCatalogVersion)
            : { roles: parsed.roles, scripts: parsed.scripts }
          return {
            revision: (parsed.revision ?? 1) + 1,
            roles,
            scripts,
            tasks: parsed.tasks,
            storageBytes: parsed.storageBytes ?? 0,
            maxStorageBytes: STUDIO_MAX_STORAGE_BYTES,
          }
        }
      }
    } catch { /* use default */ }
  }
  const initial = createInitialDemoSnapshot()
  saveDemoSnapshot(initial)
  return initial
}

function applyHostSnapshot(snap: StudioSnapshot): void {
  if (state.instanceId === snap.instanceId && snap.revision < state.revision) return
  state = {
    ...snap,
    status: 'ready',
    errorCode: null,
  }
  emit()
}

/** Only the standalone preview opts into simulated recording. */
export function enableStudioDemo(): void {
  if (state.status === 'demo') return
  applyDemoSnapshot(loadDemoSnapshot())
  if (state.tasks.some(task => task.status === 'queued' || task.status === 'running')) runDemoWorker()
}

function applyDemoSnapshot(snap: StudioSnapshot): void {
  const next = { ...snap, revision: state.revision + 1 }
  saveDemoSnapshot(next)
  state = {
    ...next,
    status: 'demo',
    errorCode: null,
  }
  emit()
}

function runDemoWorker(): void {
  if (typeof window === 'undefined' || demoSimTimer !== null) return
  demoSimTimer = window.setInterval(() => {
    if (state.status !== 'demo') {
      if (demoSimTimer !== null) { window.clearInterval(demoSimTimer); demoSimTimer = null }
      return
    }
    const target = [...state.tasks].reverse().find(t => t.status === 'queued' || t.status === 'running')
    if (!target) {
      if (demoSimTimer !== null) { window.clearInterval(demoSimTimer); demoSimTimer = null }
      return
    }
    const tasks = structuredClone(state.tasks)
    const task = tasks.find(item => item.id === target.id)!
    task.status = 'running'
    const runningIdx = task.lines.findIndex(line => line.status === 'running')
    if (runningIdx >= 0) {
      task.lines[runningIdx]!.status = 'completed'
    }
    const nextPending = task.lines.find(line => line.status === 'pending')
    if (nextPending) {
      nextPending.status = 'running'
      task.completedLines = task.lines.filter(line => line.status === 'completed').length
      task.updatedAt = Date.now()
      applyDemoSnapshot({ ...state, tasks })
      return
    }
    // All lines completed in demo!
    let cursorMs = 0
    for (const line of task.lines) {
      const speechMs = Math.max(1200, Array.from(line.text).length * 180)
      line.startMs = cursorMs
      line.durationMs = speechMs
      cursorMs += speechMs + line.pauseAfterMs
      line.endMs = cursorMs
    }
    task.status = 'completed'
    task.completedLines = task.lines.length
    task.durationMs = cursorMs
    task.audioSize = Math.round((cursorMs / 1000) * 48000)
    task.completedAt = Date.now()
    task.updatedAt = Date.now()
    applyDemoSnapshot({ ...state, tasks, storageBytes: tasks.reduce((s, item) => s + (item.audioSize ?? 0), 0) })
  }, 650)
}

function scheduleRefresh(): void {
  if (listeners.size === 0 || retryTimer !== undefined) return
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    void refreshStudioState()
  }, 2500)
}

function disconnect(): void {
  clearTimeout(retryTimer)
  retryTimer = undefined
  stateRequest?.abort()
  stateRequest = null
  const source = eventSource
  eventSource = null
  source?.close()
}

function studioSnapshot(value: unknown): StudioSnapshot {
  const snap = value as Partial<StudioSnapshot> | null
  if (!snap || !Array.isArray(snap.roles) || !Array.isArray(snap.scripts) || !Array.isArray(snap.tasks)
    || typeof snap.storageBytes !== 'number' || typeof snap.maxStorageBytes !== 'number' || !Number.isSafeInteger(snap.revision)) {
    throw new StudioRequestError('studio-unavailable')
  }
  return snap as StudioSnapshot
}

function connectionFailed(code = 'studio-unavailable'): void {
  state = { ...state, status: 'error', errorCode: code }
  emit()
  scheduleRefresh()
}

function connectEvents(): void {
  if (listeners.size === 0 || eventSource !== null) return
  if (typeof EventSource === 'undefined') {
    scheduleRefresh()
    return
  }
  try {
    const source = new EventSource(hostRoute(TTS_STUDIO_EVENTS_ROUTE))
    eventSource = source
    source.onmessage = (event) => {
      if (eventSource !== source) return
      try {
        applyHostSnapshot(studioSnapshot(JSON.parse(event.data)))
        clearTimeout(retryTimer)
        retryTimer = undefined
      } catch { /* ignore malformed frame */ }
    }
    source.onerror = () => {
      if (eventSource !== source) return
      // EventSource reconnects automatically after an interrupted stream.
      // A terminal HTTP error closes it, so the next refresh opens a new one.
      if (source.readyState === EventSource.CLOSED) eventSource = null
      connectionFailed()
    }
  } catch {
    scheduleRefresh()
  }
}

export async function refreshStudioState(): Promise<void> {
  if (state.status === 'demo' || stateRequest !== null || typeof fetch === 'undefined') return
  clearTimeout(retryTimer)
  retryTimer = undefined
  const controller = new AbortController()
  stateRequest = controller
  try {
    const response = await fetch(hostRoute(TTS_STUDIO_STATE_ROUTE), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw StudioRequestError.fromResponse(payload, 'studio-unavailable')
    if (controller.signal.aborted) return
    applyHostSnapshot(studioSnapshot(payload))
    connectEvents()
  } catch (error) {
    if (!controller.signal.aborted) connectionFailed(error instanceof StudioRequestError ? error.message : undefined)
  } finally {
    if (stateRequest === controller) stateRequest = null
  }
}

export class StudioRequestError extends Error {
  constructor(code: string, readonly lineNumber?: number) { super(code) }

  static fromResponse(value: unknown, fallback = 'studio-operation-failed'): StudioRequestError {
    const payload = value as { error?: unknown; lineNumber?: unknown } | null
    return new StudioRequestError(
      typeof payload?.error === 'string' ? payload.error : fallback,
      typeof payload?.lineNumber === 'number' ? payload.lineNumber : undefined,
    )
  }
}

export function studioErrorMessage(error: unknown, t: Translate): string {
  const code = error instanceof StudioScriptParseError ? error.code
    : error instanceof Error ? error.message
    : typeof error === 'string' ? error : ''
  const line = error instanceof StudioScriptParseError || error instanceof StudioRequestError ? error.lineNumber : undefined
  if (code === 'text-too-long' && line !== undefined) return t('studio.error.lineTooLong').replace('{line}', String(line))
  if (code === 'studio-line-limit-exceeded' && line !== undefined) return t('studio.error.tooManyLines').replace('{line}', String(line))
  if (code === 'invalid-role-name' && line !== undefined) return t('studio.error.invalidSpeaker').replace('{line}', String(line))
  if (code === 'studio-role-in-use') return t('studio.error.roleInUse')
  if (code === 'studio-role-not-found') return t('studio.error.missingRole')
  if (code === 'studio-role-disabled') return t('studio.error.roleDisabled')
  if (code === 'studio-storage-limit-exceeded') return t('studio.error.storageFull')
  if (code === 'studio-storage-write-failed') return t('studio.error.storageWrite')
  if (code === 'studio-store-busy') return t('studio.error.storeBusy')
  if (code === 'studio-store-corrupt') return t('studio.error.storeCorrupt')
  if (code === 'studio-title-required') return t('studio.error.titleRequired')
  if (code === 'studio-lines-required') return t('studio.error.linesRequired')
  if (code === 'studio-task-limit-exceeded') return t('studio.error.taskLimit')
  if (code === 'tts-timeout') return t('studio.error.timeout')
  if (code === 'rate-limited') return t('studio.error.rateLimited')
  if (code === 'api-key-rejected' || code === 'api-key-required') return t('studio.error.keyRejected')
  if (code === 'external-provider-not-ready' || code === 'external-provider-unavailable' || code === 'moss-disabled') return t('studio.error.engineUnavailable')
  return t('studio.error.failed')
}

async function writeStudioJson<T>(route: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const response = await fetch(hostRoute(route), {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      [TTS_DESKTOP_WRITE_HEADER]: '1',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as T & { state?: StudioSnapshot }
  if (!response.ok) throw StudioRequestError.fromResponse(payload)
  if (payload?.state) applyHostSnapshot(payload.state)
  return payload
}

async function deleteStudioQuery(route: string, id: string): Promise<void> {
  const response = await fetch(`${hostRoute(route)}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      [TTS_DESKTOP_WRITE_HEADER]: '1',
    },
  })
  const payload = await response.json().catch(() => ({})) as { state?: StudioSnapshot }
  if (!response.ok) throw StudioRequestError.fromResponse(payload)
  if (payload?.state) applyHostSnapshot(payload.state)
}

function randomLocalId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const studioClient = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    if (listeners.size === 1) void refreshStudioState()
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) disconnect()
    }
  },
  getSnapshot(): StudioClientView {
    return state
  },
  audioUrl(taskId: string, download = false): string {
    if (state.status === 'demo') return hostRoute('/plugins/xiaomi-mimo-tts/preview-audio/hello.mp3')
    return `${hostRoute(TTS_STUDIO_AUDIO_ROUTE)}?taskId=${encodeURIComponent(taskId)}${download ? '&download=1' : ''}`
  },
  async saveRole(input: StudioRoleInput): Promise<StudioRole> {
    if (state.status === 'demo') {
      const now = Date.now()
      const roles = structuredClone(state.roles)
      const idx = input.id ? roles.findIndex(r => r.id === input.id) : -1
      const existing = roles[idx]
      const role: StudioRole = {
        id: existing?.id ?? input.id ?? randomLocalId(),
        name: input.name.trim() || '新角色',
        color: input.color ?? pickStudioRoleColor(roles.length),
        provider: input.provider,
        model: input.model ?? 'mimo-v2.5-tts',
        voice: input.voice ?? '冰糖',
        ...(input.voiceDesignPrompt ? { voiceDesignPrompt: input.voiceDesignPrompt } : {}),
        ...(input.speechInstruction ? { speechInstruction: input.speechInstruction } : {}),
        voiceRate: input.voiceRate ?? 1,
        ...(existing?.enabled !== undefined ? { enabled: existing.enabled } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      if (idx >= 0) roles[idx] = role
      else roles.push(role)
      applyDemoSnapshot({ ...state, roles })
      return role
    }
    const res = await writeStudioJson<{ role: StudioRole }>(TTS_STUDIO_ROLES_ROUTE, input)
    return res.role
  },
  async setRoleEnabled(id: string, enabled: boolean): Promise<void> {
    if (state.status === 'demo') {
      const role = state.roles.find(item => item.id === id)
      if (!role) throw new StudioRequestError('studio-role-not-found')
      if ((role.enabled !== false) === enabled) return
      const updated = { ...role, enabled, updatedAt: Date.now() }
      applyDemoSnapshot({ ...state, roles: state.roles.map(item => item.id === id ? updated : item) })
      return
    }
    await writeStudioJson(TTS_STUDIO_ROLES_ROUTE, { id, enabled }, 'PATCH')
  },
  async deleteRole(id: string): Promise<void> {
    if (state.status === 'demo') {
      if (state.scripts.some(script => script.lines.some(line => line.roleId === id))) {
        throw new StudioRequestError('studio-role-in-use')
      }
      applyDemoSnapshot({ ...state, roles: state.roles.filter(r => r.id !== id) })
      return
    }
    await deleteStudioQuery(TTS_STUDIO_ROLES_ROUTE, id)
  },
  async saveScript(input: StudioScriptInput): Promise<StudioScript> {
    if (state.status === 'demo') {
      const now = Date.now()
      const scripts = structuredClone(state.scripts)
      const idx = input.id ? scripts.findIndex(s => s.id === input.id) : -1
      const script: StudioScript = {
        id: idx >= 0 ? scripts[idx]!.id : (input.id ?? randomLocalId()),
        title: input.title.trim() || '未命名剧本',
        ...(input.description ? { description: input.description } : {}),
        lines: input.lines.map(l => ({
          id: l.id ?? randomLocalId(),
          roleId: l.roleId,
          text: l.text,
          ...(l.speechInstruction ? { speechInstruction: l.speechInstruction } : {}),
          pauseAfterMs: l.pauseAfterMs ?? STUDIO_DEFAULT_PAUSE_MS,
        })),
        createdAt: idx >= 0 ? scripts[idx]!.createdAt : now,
        updatedAt: now,
      }
      if (idx >= 0) scripts[idx] = script
      else scripts.unshift(script)
      applyDemoSnapshot({ ...state, scripts })
      return script
    }
    const res = await writeStudioJson<{ script: StudioScript }>(TTS_STUDIO_SCRIPTS_ROUTE, input)
    return res.script
  },
  async importScript(input: { id?: string; title: string; description?: string; text: string; defaultNarratorName?: string }): Promise<{ script: StudioScript; createdRoles: StudioRole[] }> {
    if (state.status === 'demo') {
      const now = Date.now()
      const materialized = materializeStudioScript(
        input.text,
        state.roles,
        (name, color) => ({
          id: randomLocalId(),
          name,
          color,
          provider: 'xiaomi',
          model: 'mimo-v2.5-tts',
          voice: '冰糖',
          voiceRate: 1,
          createdAt: now,
          updatedAt: now,
        }),
        randomLocalId,
        input.defaultNarratorName ?? '旁白',
      )
      const roles = [...state.roles, ...materialized.createdRoles]
      applyDemoSnapshot({ ...state, roles })
      const script = await this.saveScript({
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        lines: materialized.lines,
      })
      return { script, createdRoles: materialized.createdRoles }
    }
    return writeStudioJson<{ script: StudioScript; createdRoles: StudioRole[] }>(TTS_STUDIO_SCRIPTS_ROUTE, {
      kind: 'import',
      ...input,
    })
  },
  async deleteScript(id: string): Promise<void> {
    if (state.status === 'demo') {
      applyDemoSnapshot({ ...state, scripts: state.scripts.filter(s => s.id !== id) })
      return
    }
    await deleteStudioQuery(TTS_STUDIO_SCRIPTS_ROUTE, id)
  },
  async startTask(input: { scriptId?: string; title?: string; lines?: StudioLineInput[] }): Promise<StudioTask> {
    if (state.status === 'demo') {
      const script = input.scriptId ? state.scripts.find(s => s.id === input.scriptId) : undefined
      const sourceLines = script?.lines ?? (input.lines ?? []).map(l => ({
        id: l.id ?? randomLocalId(),
        roleId: l.roleId,
        text: l.text,
        ...(l.speechInstruction ? { speechInstruction: l.speechInstruction } : {}),
        pauseAfterMs: l.pauseAfterMs ?? STUDIO_DEFAULT_PAUSE_MS,
      }))
      const roleMap = new Map(state.roles.map(r => [r.id, r]))
      const now = Date.now()
      const task: StudioTask = {
        id: randomLocalId(),
        ...(script ? { scriptId: script.id } : {}),
        title: input.title ?? script?.title ?? '示例剧集',
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        totalLines: sourceLines.length,
        completedLines: 0,
        failedLines: 0,
        lines: sourceLines.map(line => {
          const role = roleMap.get(line.roleId)
          if (!role) throw new StudioRequestError('studio-role-not-found')
          if (role.enabled === false) throw new StudioRequestError('studio-role-disabled')
          return {
            lineId: line.id,
            roleId: role.id,
            roleName: role.name,
            roleColor: role.color,
            provider: role.provider,
            model: role.model,
            voice: role.voice,
            voiceRate: role.voiceRate,
            text: line.text,
            ...(line.speechInstruction ? { speechInstruction: line.speechInstruction } : {}),
            pauseAfterMs: line.pauseAfterMs,
            status: 'pending',
          }
        }),
      }
      applyDemoSnapshot({ ...state, tasks: [task, ...state.tasks] })
      runDemoWorker()
      return task
    }
    const res = await writeStudioJson<{ task: StudioTask }>(TTS_STUDIO_TASKS_ROUTE, { action: 'start', ...input })
    return res.task
  },
  async taskAction(action: 'pause' | 'resume' | 'cancel' | 'retry-line', taskId: string, lineIndex?: number): Promise<StudioTask> {
    if (state.status === 'demo') {
      const tasks = structuredClone(state.tasks)
      const task = tasks.find(t => t.id === taskId)!
      if (action === 'pause') task.status = 'paused'
      else if (action === 'resume' || action === 'retry-line') {
        task.status = 'queued'
        for (const l of task.lines) if (l.status === 'failed' || l.status === 'running') l.status = 'pending'
      } else if (action === 'cancel') task.status = 'canceled'
      applyDemoSnapshot({ ...state, tasks })
      if (task.status === 'queued') runDemoWorker()
      return task
    }
    const res = await writeStudioJson<{ task: StudioTask }>(TTS_STUDIO_TASKS_ROUTE, { action, taskId, ...(lineIndex === undefined ? {} : { lineIndex }) })
    return res.task
  },
  async deleteTask(id: string): Promise<void> {
    if (state.status === 'demo') {
      applyDemoSnapshot({ ...state, tasks: state.tasks.filter(t => t.id !== id) })
      return
    }
    await deleteStudioQuery(TTS_STUDIO_TASKS_ROUTE, id)
  },
}

export function useStudioState(): StudioClientView {
  return useSyncExternalStore(studioClient.subscribe, studioClient.getSnapshot, studioClient.getSnapshot)
}
