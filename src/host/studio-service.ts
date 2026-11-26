import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import {
  BREEZE_TTS_MODEL,
  DEEPSEEK_TTS_MODEL,
  DEEPSEEK_VOICES,
  DOUBAO_TTS_MODELS,
  STUDIO_DEFAULT_PAUSE_MS,
  STUDIO_MAX_LINE_CHARACTERS,
  STUDIO_MAX_LINES_PER_SCRIPT,
  STUDIO_MAX_SCRIPT_TITLE_LENGTH,
  STUDIO_MAX_ROLES,
  STUDIO_MAX_SCRIPTS,
  STUDIO_MAX_TASKS,
  TTS_PROVIDERS,
  TTS_VOICES,
  normalizeStudioPauseMs,
  normalizeVoiceRate,
  pickStudioRoleColor,
  prepareTtsText,
  resolveTtsSettings,
  ttsSelection,
  usesCloudVoiceRate,
} from '../shared.js'
import type {
  ResolvedTtsSettings,
  StudioLine,
  StudioLineInput,
  StudioRole,
  StudioRoleInput,
  StudioRoleProvider,
  StudioScript,
  StudioScriptInput,
  StudioSnapshot,
  StudioTask,
  StudioTaskLine,
  TtsProvider,
} from '../shared.js'
import { materializeStudioScript } from '../text/studio-script-parser.js'
import type { SpeechSynthesisService, StudioDirectorReceipt } from '../host-api.js'
import { synthesizeMoss } from './moss.js'
import { TtsProviderError } from './provider-error.js'
import { StudioDiskStore, studioLineCacheKey } from './studio-store.js'
import type { StudioDirectorRecord, StudioRecords } from './studio-store.js'
import { decodeWavMono16, stitchWavSegments } from './wav-stitcher.js'

export interface StudioStartTaskInput {
  scriptId?: string
  title?: string
  lines?: StudioLineInput[]
  autoStart?: boolean
}

export interface StudioImportScriptInput {
  id?: string
  title: string
  description?: string
  text: string
  defaultNarratorName?: string
}

const SAFE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/u

function cleanId(id?: string): string {
  if (id !== undefined) {
    if (typeof id !== 'string') throw new TtsProviderError('invalid-studio-id', 'Invalid Studio identifier.', 400)
    const trimmed = id.trim()
    if (!SAFE_ID_PATTERN.test(trimmed)) throw new TtsProviderError('invalid-studio-id', 'Invalid Studio identifier.', 400)
    return trimmed
  }
  return randomUUID()
}

function validateRoleProvider(provider: unknown): StudioRoleProvider {
  if (typeof provider !== 'string') throw new TtsProviderError('invalid-provider', 'Select a supported Studio voice provider.', 400)
  if (provider === 'moss' || TTS_PROVIDERS.includes(provider as TtsProvider) || /^external:[a-z0-9][a-z0-9._-]{0,119}$/u.test(provider)) {
    return provider as StudioRoleProvider
  }
  throw new TtsProviderError('invalid-provider', 'Browser system voices cannot run in background Studio tasks.', 400)
}

function studioTaskLine(line: StudioLine, role: StudioRole): StudioTaskLine {
  if (role.enabled === false) throw new TtsProviderError('studio-role-disabled', `Enable or replace the Studio role “${role.name}”.`, 409)
  const instruction = line.speechInstruction?.trim() || role.speechInstruction?.trim()
  return {
    lineId: line.id,
    roleId: role.id,
    roleName: role.name,
    roleColor: role.color,
    provider: role.provider,
    model: role.model,
    voice: role.voice,
    ...(role.voiceDesignPrompt ? { voiceDesignPrompt: role.voiceDesignPrompt } : {}),
    ...(instruction ? { speechInstruction: instruction } : {}),
    voiceRate: role.voiceRate,
    text: line.text,
    pauseAfterMs: line.pauseAfterMs,
    status: 'pending',
  }
}

function studioPlaybackRate(line: StudioTaskLine): number {
  return TTS_PROVIDERS.some(provider => provider === line.provider && usesCloudVoiceRate(provider)) ? 1 : line.voiceRate
}

interface StudioRun {
  taskId: string
  controller: AbortController
  stop?: 'pause' | 'cancel'
  finished: Promise<void>
  finish: () => void
}

export class HostSpeechStudioService {
  private roles: StudioRole[] = []
  private scripts: StudioScript[] = []
  private tasks: StudioTask[] = []
  private directorRequests: StudioDirectorRecord[] = []
  private storageBytes = 0
  private readonly instanceId = randomUUID()
  private revision = 1
  private loadPromise: Promise<void> | null = null
  private releaseStore: (() => Promise<void>) | undefined
  private disposed = false
  private disposal: Promise<void> | undefined
  private worker: Promise<void> | null = null
  private active: StudioRun | undefined
  private changes: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly speech: SpeechSynthesisService,
    private readonly currentSettings: () => ResolvedTtsSettings,
    private readonly store = new StudioDiskStore(),
    private readonly synthesizeMossAudio: typeof synthesizeMoss = synthesizeMoss,
    private readonly warn: (message: string) => void = () => {},
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    this.revision += 1
    for (const listener of this.listeners) {
      try { listener() } catch { this.warn('Studio listener failed.') }
    }
  }

  async ensureLoaded(): Promise<void> {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed', undefined, 503)
    if (this.loadPromise === null) {
      this.loadPromise = this.load().catch(error => {
        this.loadPromise = null
        throw error
      })
    }
    await this.loadPromise
  }

  private async load(): Promise<void> {
    const release = await this.store.open()
    try {
      const loaded = await this.store.load()
      this.roles = loaded.roles
      this.scripts = loaded.scripts
      this.tasks = loaded.tasks
      this.directorRequests = loaded.directorRequests
      this.storageBytes = loaded.storageBytes
      this.releaseStore = release
    } catch (error) {
      await release()
      throw error
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.changes.then(operation)
    this.changes = result.then(() => {}, () => {})
    return result
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      await this.ensureLoaded()
      if (this.disposed) throw new TtsProviderError('speech-service-disposed', undefined, 503)
      return operation()
    })
  }

  private async commit(changes: Partial<StudioRecords>): Promise<void> {
    const next = {
      roles: this.roles,
      scripts: this.scripts,
      tasks: this.tasks,
      directorRequests: this.directorRequests,
      ...changes,
    }
    try { await this.store.saveManifest(next) }
    catch { throw new TtsProviderError('studio-storage-write-failed', 'Studio could not save its state.', 503) }
    this.roles = next.roles
    this.scripts = next.scripts
    this.tasks = next.tasks
    this.directorRequests = next.directorRequests
    this.emit()
  }

  private findTask(taskId: string): StudioTask {
    const task = this.tasks.find(item => item.id === taskId)
    if (!task) throw new TtsProviderError('studio-task-not-found', 'Studio task not found.', 404)
    return task
  }

  private async commitTask(task: StudioTask): Promise<void> {
    const saved = structuredClone(task)
    await this.commit({ tasks: this.tasks.map(item => item.id === task.id ? saved : item) })
  }

  async snapshot(): Promise<StudioSnapshot> {
    await this.ensureLoaded()
    return structuredClone({
      instanceId: this.instanceId,
      revision: this.revision,
      roles: this.roles,
      scripts: this.scripts,
      tasks: this.tasks,
      storageBytes: this.storageBytes,
      maxStorageBytes: this.store.maxStorageBytes,
      storageRoot: this.store.root,
    })
  }

  private findDirectorRequest(requestId: string): StudioDirectorRecord | undefined {
    if (typeof requestId !== 'string' || !SAFE_ID_PATTERN.test(requestId)) {
      throw new TtsProviderError('invalid-studio-director-request-id', undefined, 400)
    }
    return this.directorRequests.find(request => request.requestId === requestId)
  }

  async getDirectorRequest(requestId: string): Promise<StudioDirectorReceipt> {
    await this.ensureLoaded()
    const request = this.findDirectorRequest(requestId)
    if (!request) throw new TtsProviderError('studio-director-request-not-found', undefined, 404)
    return {
      requestId: request.requestId,
      status: request.status,
      scriptIds: [...request.scriptIds],
      taskIds: request.recordings.map(recording => recording.taskId),
    }
  }

  async beginDirectorRequest(requestId: string, fingerprint: string, canStart: boolean): Promise<boolean> {
    return this.mutate(async () => {
      const existing = this.findDirectorRequest(requestId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new TtsProviderError('studio-director-request-conflict', undefined, 409)
        return false
      }
      if (!canStart) throw new TtsProviderError('studio-director-session-busy', undefined, 409)
      await this.commit({ directorRequests: [...this.directorRequests, {
        requestId,
        fingerprint,
        status: 'generating',
        scriptIds: [],
        recordings: [],
      }] })
      return true
    })
  }

  async finishDirectorRequest(requestId: string, outcome: 'completed' | 'failed' | 'interrupted'): Promise<void> {
    await this.mutate(async () => {
      const request = this.findDirectorRequest(requestId)
      if (request?.status !== 'generating') return
      const allSubmitted = request.recordings.length > 0 && request.recordings.length === request.scriptIds.length
      const status = outcome === 'completed' ? (allSubmitted ? 'submitted' : 'incomplete') : outcome
      await this.commit(this.directorRequestChange({ ...request, status }))
    })
  }

  private activeDirectorRequest(requestId: string | undefined): StudioDirectorRecord | undefined {
    if (requestId === undefined) return undefined
    const request = this.findDirectorRequest(requestId)
    if (request?.status !== 'generating') throw new TtsProviderError('studio-director-request-inactive', undefined, 409)
    return request
  }

  private directorRequestChange(request: StudioDirectorRecord): Pick<StudioRecords, 'directorRequests'> {
    return { directorRequests: this.directorRequests.map(item => item.requestId === request.requestId ? request : item) }
  }

  private writableDirectorScript(requestId: string | undefined, id?: string): StudioDirectorRecord | undefined {
    const request = this.activeDirectorRequest(requestId)
    const scriptId = typeof id === 'string' ? id.trim() : undefined
    if (!request || !scriptId) return request
    const belongsToAnotherRequest = !request.scriptIds.includes(scriptId) && this.scripts.some(script => script.id === scriptId)
    if (belongsToAnotherRequest || request.recordings.some(recording => recording.scriptId === scriptId)) {
      throw new TtsProviderError('studio-director-script-conflict', undefined, 409)
    }
    return request
  }

  private directorScriptChange(request: StudioDirectorRecord | undefined, scriptId: string): Partial<StudioRecords> {
    if (!request || request.scriptIds.includes(scriptId)) return {}
    return this.directorRequestChange({ ...request, scriptIds: [...request.scriptIds, scriptId] })
  }

  private defaultRoleTemplate(name: string, color: string): StudioRole {
    const settings = resolveTtsSettings(this.currentSettings())
    const engine = this.speech.engineState()
    const now = Date.now()
    if (engine.provider.startsWith('external:')) {
      return {
        id: randomUUID(),
        name,
        color,
        provider: engine.provider,
        model: engine.selection?.model ?? engine.models?.[0]?.id ?? '',
        voice: engine.selection?.voice ?? engine.models?.[0]?.voices[0]?.id ?? '',
        ...(engine.selection?.speechInstruction ? { speechInstruction: engine.selection.speechInstruction } : {}),
        voiceRate: 1,
        createdAt: now,
        updatedAt: now,
      }
    }
    const selection = ttsSelection(settings)
    return {
      id: randomUUID(),
      name,
      color,
      provider: selection.provider,
      model: selection.model,
      voice: selection.voice,
      ...('voiceDesignPrompt' in selection && selection.voiceDesignPrompt ? { voiceDesignPrompt: selection.voiceDesignPrompt } : {}),
      ...('speechInstruction' in selection && selection.speechInstruction ? { speechInstruction: selection.speechInstruction } : {}),
      voiceRate: normalizeVoiceRate(settings.voiceRate),
      createdAt: now,
      updatedAt: now,
    }
  }

  private normalizeRoleInput(input: StudioRoleInput, existing?: StudioRole): StudioRole {
    if (!input || typeof input !== 'object') throw new TtsProviderError('invalid-request', 'Expected a role object.', 400)
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name || Array.from(name).length > 32) throw new TtsProviderError('invalid-role-name', 'Role name must be 1..32 characters.', 400)
    const provider = validateRoleProvider(input.provider)
    const settings = resolveTtsSettings(this.currentSettings())
    const now = Date.now()
    const id = existing?.id ?? cleanId(input.id)
    const color = typeof input.color === 'string' && SAFE_COLOR_PATTERN.test(input.color.trim())
      ? input.color.trim()
      : existing?.color ?? pickStudioRoleColor(this.roles.length)
    const voiceRate = input.voiceRate !== undefined ? normalizeVoiceRate(input.voiceRate) : existing?.voiceRate ?? 1
    const previous = existing?.provider === provider ? existing : undefined
    const speechInstruction = typeof input.speechInstruction === 'string' ? input.speechInstruction.trim().slice(0, 300) : previous?.speechInstruction

    let model = typeof input.model === 'string' ? input.model.trim() : previous?.model ?? ''
    const selectVoice = (fallback: string): string => typeof input.voice === 'string'
      ? input.voice.trim()
      : previous?.model === model ? previous.voice : fallback
    let voice: string
    let voiceDesignPrompt: string | undefined

    if (provider === 'xiaomi') {
      if (!model) model = settings.model
      if (model !== 'mimo-v2.5-tts' && model !== 'mimo-v2.5-tts-voicedesign') throw new TtsProviderError('invalid-model', 'Invalid Xiaomi model.', 400)
      voice = selectVoice(settings.voice)
      if (model === 'mimo-v2.5-tts-voicedesign') {
        voiceDesignPrompt = (typeof input.voiceDesignPrompt === 'string'
          ? input.voiceDesignPrompt.trim().slice(0, 500)
          : previous?.voiceDesignPrompt ?? settings.voiceDesignPrompt.trim())
        if (!voiceDesignPrompt) throw new TtsProviderError('voice-required', 'Enter a Xiaomi voice design prompt.', 400)
      } else if (!TTS_VOICES.some(candidate => candidate === voice)) {
        throw new TtsProviderError('voice-unavailable', 'Select a Xiaomi preset voice.', 400)
      }
    } else if (provider === 'doubao') {
      if (!model) model = settings.doubaoModel
      if (!DOUBAO_TTS_MODELS.includes(model as typeof DOUBAO_TTS_MODELS[number])) throw new TtsProviderError('invalid-model', 'Invalid Doubao model.', 400)
      voice = selectVoice(model === 'seed-icl-2.0' ? settings.doubaoClonedVoice : settings.doubaoVoice)
      if (!voice) throw new TtsProviderError('voice-required', 'Select or enter a Doubao voice ID.', 400)
    } else if (provider === 'breeze') {
      model = BREEZE_TTS_MODEL
      voice = selectVoice(settings.breezeVoice)
      if (!voice) throw new TtsProviderError('voice-required', 'Select a Breeze voice.', 400)
    } else if (provider === 'deepseek') {
      model = DEEPSEEK_TTS_MODEL
      voice = selectVoice(settings.deepseekVoice)
      if (!DEEPSEEK_VOICES.includes(voice as typeof DEEPSEEK_VOICES[number])) throw new TtsProviderError('voice-unavailable', 'Invalid DeepSeek voice.', 400)
    } else if (provider === 'moss') {
      model = 'moss-tts-nano'
      voice = selectVoice(settings.mossVoice)
      if (!voice) throw new TtsProviderError('moss-voice-required', 'Select a MOSS voice.', 400)
    } else {
      const engine = this.speech.engineState()
      const selection = engine.provider === provider ? engine.selection : undefined
      if (!model) model = selection?.model ?? ''
      voice = selectVoice(selection?.model === model ? selection.voice : '')
    }

    return {
      id,
      name,
      color,
      provider,
      model,
      voice,
      ...(voiceDesignPrompt ? { voiceDesignPrompt } : {}),
      ...(speechInstruction ? { speechInstruction } : {}),
      voiceRate,
      ...(existing?.enabled !== undefined ? { enabled: existing.enabled } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  async saveRole(input: StudioRoleInput): Promise<StudioRole> {
    return this.mutate(async () => {
      const id = cleanId(input?.id)
      const existing = this.roles.find(role => role.id === id)
      if (!existing && this.roles.length >= STUDIO_MAX_ROLES) {
        throw new TtsProviderError('studio-role-limit-exceeded', 'Maximum number of Studio roles reached.', 409)
      }
      const role = this.normalizeRoleInput({ ...input, id }, existing)
      await this.commit({ roles: existing ? this.roles.map(item => item.id === id ? role : item) : [...this.roles, role] })
      return structuredClone(role)
    })
  }

  async setRoleEnabled(roleId: string, enabled: boolean): Promise<StudioRole> {
    return this.mutate(async () => {
      const id = cleanId(roleId)
      const existing = this.roles.find(role => role.id === id)
      if (!existing) throw new TtsProviderError('studio-role-not-found', 'Studio role not found.', 404)
      if ((existing.enabled !== false) === enabled) return structuredClone(existing)
      const role = { ...existing, enabled, updatedAt: Date.now() }
      await this.commit({ roles: this.roles.map(item => item.id === id ? role : item) })
      return structuredClone(role)
    })
  }

  async deleteRole(roleId: string): Promise<void> {
    await this.mutate(async () => {
      const roles = this.roles.filter(role => role.id !== roleId)
      if (roles.length === this.roles.length) throw new TtsProviderError('studio-role-not-found', 'Studio role not found.', 404)
      if (this.scripts.some(script => script.lines.some(line => line.roleId === roleId))) {
        throw new TtsProviderError('studio-role-in-use', 'Reassign its script lines before deleting this role.', 409)
      }
      await this.commit({ roles })
    })
  }

  private normalizeLines(inputs: readonly StudioLineInput[], roles = this.roles): StudioLine[] {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new TtsProviderError('studio-lines-required', 'Add at least one script line.', 400)
    }
    if (inputs.length > STUDIO_MAX_LINES_PER_SCRIPT) {
      throw new TtsProviderError('studio-line-limit-exceeded', `A script may contain at most ${STUDIO_MAX_LINES_PER_SCRIPT} lines.`, 413)
    }
    const roleIds = new Set(roles.map(role => role.id))
    return inputs.map(item => {
      if (!item || typeof item !== 'object') throw new TtsProviderError('invalid-request', 'Invalid script line.', 400)
      const roleId = typeof item.roleId === 'string' ? item.roleId.trim() : ''
      if (!roleId || !roleIds.has(roleId)) throw new TtsProviderError('studio-role-not-found', 'Line references an unknown Studio role.', 400)
      const text = typeof item.text === 'string' ? item.text.trim() : ''
      if (!text) throw new TtsProviderError('text-required', 'Line text cannot be empty.', 400)
      if (Array.from(text).length > STUDIO_MAX_LINE_CHARACTERS) {
        throw new TtsProviderError('text-too-long', `Each Studio line may contain at most ${STUDIO_MAX_LINE_CHARACTERS} characters.`, 413)
      }
      const speechInstruction = typeof item.speechInstruction === 'string' && item.speechInstruction.trim()
        ? item.speechInstruction.trim().slice(0, 300)
        : undefined
      return {
        id: cleanId(item.id),
        roleId,
        text,
        ...(speechInstruction ? { speechInstruction } : {}),
        pauseAfterMs: normalizeStudioPauseMs(item.pauseAfterMs, STUDIO_DEFAULT_PAUSE_MS),
      }
    })
  }

  private prepareScript(input: StudioScriptInput, roles = this.roles): { script: StudioScript; scripts: StudioScript[] } {
    const title = typeof input?.title === 'string' ? input.title.trim().slice(0, STUDIO_MAX_SCRIPT_TITLE_LENGTH) : ''
    if (!title) throw new TtsProviderError('studio-title-required', 'Enter a script title.', 400)
    const id = cleanId(input.id)
    const existing = this.scripts.find(script => script.id === id)
    if (!existing && this.scripts.length >= STUDIO_MAX_SCRIPTS) {
      throw new TtsProviderError('studio-script-limit-exceeded', 'Maximum number of Studio scripts reached.', 409)
    }
    const lines = this.normalizeLines(input.lines, roles)
    const now = Date.now()
    const description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 240)
      : undefined
    const script: StudioScript = {
      id,
      title,
      ...(description ? { description } : {}),
      lines,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    return { script, scripts: existing ? this.scripts.map(item => item.id === id ? script : item) : [script, ...this.scripts] }
  }

  async saveScript(input: StudioScriptInput, directorRequestId?: string): Promise<StudioScript> {
    return this.mutate(async () => {
      const request = this.writableDirectorScript(directorRequestId, input?.id)
      const { script, scripts } = this.prepareScript(input)
      await this.commit({ scripts, ...this.directorScriptChange(request, script.id) })
      return structuredClone(script)
    })
  }

  async importScript(input: StudioImportScriptInput, directorRequestId?: string): Promise<{ script: StudioScript; createdRoles: StudioRole[] }> {
    return this.mutate(async () => {
      const request = this.writableDirectorScript(directorRequestId, input.id)
      const rawText = typeof input.text === 'string' ? input.text : ''
      const { lines, createdRoles } = materializeStudioScript(
        rawText,
        this.roles,
        (name, color) => this.defaultRoleTemplate(name, color),
        () => randomUUID(),
        input.defaultNarratorName || '旁白',
      )
      const roles = [...this.roles, ...createdRoles]
      if (roles.length > STUDIO_MAX_ROLES) {
        throw new TtsProviderError('studio-role-limit-exceeded', 'Maximum number of Studio roles reached.', 409)
      }
      const { script, scripts } = this.prepareScript({
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        lines,
      }, roles)
      await this.commit({ roles, scripts, ...this.directorScriptChange(request, script.id) })
      return structuredClone({ script, createdRoles })
    })
  }

  async deleteScript(scriptId: string): Promise<void> {
    await this.mutate(async () => {
      const scripts = this.scripts.filter(script => script.id !== scriptId)
      if (scripts.length === this.scripts.length) throw new TtsProviderError('studio-script-not-found', 'Studio script not found.', 404)
      await this.commit({ scripts })
    })
  }

  async startTask(input: StudioStartTaskInput, directorRequestId?: string): Promise<StudioTask> {
    const task = await this.mutate(async () => {
      const request = this.activeDirectorRequest(directorRequestId)
      if (request) {
        if (!input.scriptId || !request.scriptIds.includes(input.scriptId)) {
          throw new TtsProviderError('studio-director-script-conflict', undefined, 409)
        }
        const existing = request.recordings.find(recording => recording.scriptId === input.scriptId)
        if (existing) return structuredClone(this.findTask(existing.taskId))
      }
      if (this.tasks.length >= STUDIO_MAX_TASKS) {
        throw new TtsProviderError('studio-task-limit-exceeded', 'Delete old Studio tasks before starting new ones.', 409)
      }
      const script = input.scriptId ? this.scripts.find(item => item.id === input.scriptId) : undefined
      if (input.scriptId && !script) throw new TtsProviderError('studio-script-not-found', 'Studio script not found.', 404)
      if (!script && !input.lines) throw new TtsProviderError('invalid-request', 'Provide a scriptId or lines to start a Studio task.', 400)
      const lines = script?.lines ?? this.normalizeLines(input.lines!)
      if (!lines.length) throw new TtsProviderError('studio-lines-required', 'Add at least one script line.', 400)
      const title = (typeof input.title === 'string' ? input.title.trim().slice(0, 80) : '') || script?.title || '未命名剧集'
      const roles = new Map(this.roles.map(role => [role.id, role]))
      const taskLines = lines.map(line => {
        const role = roles.get(line.roleId)
        if (!role) throw new TtsProviderError('studio-role-not-found', 'Assign every line to an existing Studio role before recording.', 400)
        return studioTaskLine(line, role)
      })
      const now = Date.now()
      const task: StudioTask = {
        id: randomUUID(),
        ...(script ? { scriptId: script.id } : {}),
        title,
        status: input.autoStart === false ? 'paused' : 'queued',
        createdAt: now,
        updatedAt: now,
        totalLines: taskLines.length,
        completedLines: 0,
        failedLines: 0,
        lines: taskLines,
      }
      await this.commit({
        tasks: [task, ...this.tasks],
        ...(request && script ? this.directorRequestChange({
          ...request,
          recordings: [...request.recordings, { scriptId: script.id, taskId: task.id }],
        }) : {}),
      })
      return structuredClone(task)
    })
    if (task.status === 'queued') this.kickWorker()
    return task
  }

  private stopRun(run: StudioRun, mode: 'pause' | 'cancel'): void {
    if (run.stop === 'cancel') return
    run.stop = mode
    run.controller.abort(new TtsProviderError(mode === 'pause' ? 'studio-task-paused' : 'studio-task-canceled'))
  }

  private async stopTask(taskId: string, mode: 'pause' | 'cancel'): Promise<StudioTask> {
    const result = await this.mutate(async () => {
      const task = this.findTask(taskId)
      const active = this.active
      if (active?.taskId === taskId) {
        if (task.status === 'running' || task.status === 'queued') this.stopRun(active, mode)
        return active
      }
      const canStop = task.status === 'queued' || (mode === 'cancel' && (task.status === 'paused' || task.status === 'failed'))
      if (!canStop) return structuredClone(task)
      const stopped: StudioTask = { ...task, status: mode === 'pause' ? 'paused' : 'canceled', updatedAt: Date.now() }
      await this.commitTask(stopped)
      if (mode === 'cancel') await this.cleanFiles(() => this.store.deleteTaskFiles(taskId))
      return stopped
    })
    if ('finished' in result) {
      await result.finished
      return structuredClone(this.findTask(taskId))
    }
    return result
  }

  async pauseTask(taskId: string): Promise<StudioTask> {
    return this.stopTask(taskId, 'pause')
  }

  async cancelTask(taskId: string): Promise<StudioTask> {
    return this.stopTask(taskId, 'cancel')
  }

  private resetForResume(task: StudioTask): void {
    for (const line of task.lines) {
      if (line.status === 'failed' || line.status === 'running') {
        line.status = 'pending'
        delete line.errorCode
      }
    }
    delete task.errorCode
    task.completedLines = task.lines.filter(line => line.status === 'completed').length
    task.failedLines = 0
    task.status = 'queued'
    task.updatedAt = Date.now()
  }

  async resumeTask(taskId: string): Promise<StudioTask> {
    const result = await this.mutate(async () => {
      const task = structuredClone(this.findTask(taskId))
      if (task.status !== 'paused' && task.status !== 'failed') return task
      this.resetForResume(task)
      await this.commitTask(task)
      return task
    })
    if (result.status === 'queued') this.kickWorker()
    return result
  }

  async retryTaskLine(taskId: string, lineIndex: number): Promise<StudioTask> {
    const result = await this.mutate(async () => {
      const task = structuredClone(this.findTask(taskId))
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= task.lines.length) {
        throw new TtsProviderError('invalid-request', 'Line index out of range.', 400)
      }
      if (this.active?.taskId === taskId || !['paused', 'failed', 'queued'].includes(task.status)) {
        throw new TtsProviderError('studio-task-busy', 'Pause an unfinished task before retrying a line.', 409)
      }
      await this.store.clearLineCache(taskId, lineIndex)
      const target = task.lines[lineIndex]!
      target.status = 'pending'
      delete target.errorCode
      this.resetForResume(task)
      await this.updateStorage()
      await this.commitTask(task)
      return task
    })
    this.kickWorker()
    return result
  }

  async deleteTask(taskId: string): Promise<void> {
    for (;;) {
      const active = await this.mutate(async () => {
        const task = this.findTask(taskId)
        if (this.active?.taskId === taskId) {
          if (task.status === 'running' || task.status === 'queued') this.stopRun(this.active, 'cancel')
          return this.active
        }
        await this.commit({ tasks: this.tasks.filter(item => item.id !== taskId) })
        await this.cleanFiles(() => this.store.deleteTaskFiles(taskId))
      })
      if (!active) return
      await active.finished
    }
  }

  async getTaskAudioFile(taskId: string): Promise<{ path: string; size: number; task: StudioTask }> {
    await this.ensureLoaded()
    const task = this.tasks.find(item => item.id === taskId)
    if (!task || task.status !== 'completed') {
      throw new TtsProviderError('studio-audio-unavailable', 'Completed Studio audio was not found.', 404)
    }
    const path = this.store.outputPath(taskId)
    const info = await stat(path).catch(() => null)
    if (!info || !info.isFile()) {
      throw new TtsProviderError('studio-audio-unavailable', 'Completed Studio audio file is missing on disk.', 404)
    }
    return { path, size: info.size, task: structuredClone(task) }
  }

  private kickWorker(): void {
    if (this.worker !== null || this.disposed) return
    this.worker = this.runWorkerLoop().then(
      () => {
        this.worker = null
        if (this.tasks.some(task => task.status === 'queued')) this.kickWorker()
      },
      () => {
        this.worker = null
        this.warn('Studio worker stopped unexpectedly.')
      },
    )
  }

  async previewLine(input: StudioLineInput, signal: AbortSignal): Promise<Buffer> {
    if (this.disposed) throw new TtsProviderError('speech-service-disposed', undefined, 503)
    await this.ensureLoaded()
    signal.throwIfAborted()
    const line = this.normalizeLines([input])[0]!
    const role = this.roles.find(item => item.id === line.roleId)!
    const selected = studioTaskLine(line, role)
    const wav = await this.synthesizeLineWav(selected, signal)
    signal.throwIfAborted()
    return stitchWavSegments([{ wav, pauseAfterMs: 0, speed: studioPlaybackRate(selected) }]).wav
  }

  private async synthesizeLineWav(line: StudioTaskLine, signal: AbortSignal): Promise<Buffer> {
    if (line.provider === 'moss') {
      const settings = resolveTtsSettings(this.currentSettings())
      if (!settings.mossEnabled) throw new TtsProviderError('moss-disabled', 'Enable MOSS local voice before recording MOSS roles.', 409)
      if (!line.voice.trim()) throw new TtsProviderError('moss-voice-required', 'Select a MOSS voice for this role.', 400)
      const spoken = prepareTtsText(line.text)
      if (!spoken) throw new TtsProviderError('text-required', 'Line text contains no speakable content.', 400)
      const timeoutSignal = AbortSignal.timeout(settings.requestTimeoutMs)
      const combined = AbortSignal.any([signal, timeoutSignal])
      return this.synthesizeMossAudio(settings.mossBaseURL, line.voice, spoken, combined, {
        maxAudioBytes: settings.maxWavAudioBytes,
      })
    }

    const request = { text: line.text, provider: line.provider, format: 'wav' as const, signal }
    if (line.provider.startsWith('external:')) {
      const selection = line.model || line.voice || line.speechInstruction
      return (await this.speech.synthesize({
        ...request,
        ...(line.model ? { model: line.model } : {}),
        ...(line.voice ? { voice: line.voice } : {}),
        ...(selection ? { speechInstruction: line.speechInstruction ?? '' } : {}),
      })).data
    }

    if (!line.model || (line.model !== 'mimo-v2.5-tts-voicedesign' && !line.voice.trim())) {
      throw new TtsProviderError('voice-required', 'Select a model and voice for this role.', 400)
    }
    if (line.provider === 'xiaomi' && line.model === 'mimo-v2.5-tts-voicedesign' && !line.voiceDesignPrompt?.trim()) {
      throw new TtsProviderError('voice-required', 'Enter a Xiaomi voice design prompt.', 400)
    }
    if (line.provider === 'xiaomi' && line.model !== 'mimo-v2.5-tts-voicedesign' && !TTS_VOICES.some(voice => voice === line.voice)) {
      throw new TtsProviderError('voice-unavailable', 'Select a Xiaomi preset voice.', 400)
    }
    const audio = await this.speech.synthesize({
      ...request,
      model: line.model,
      voice: line.voice,
      ...(line.provider === 'xiaomi' && line.voiceDesignPrompt ? { voiceDesignPrompt: line.voiceDesignPrompt } : {}),
      speechInstruction: line.speechInstruction ?? '',
      voiceRate: line.voiceRate,
    })
    return audio.data
  }

  private async runWorkerLoop(): Promise<void> {
    while (!this.disposed) {
      const run = await this.serialize(async () => {
        if (this.disposed) return
        const task = this.tasks.findLast(item => item.status === 'queued')
        if (!task) return
        const { promise, resolve } = Promise.withResolvers<void>()
        const run: StudioRun = { taskId: task.id, controller: new AbortController(), finished: promise, finish: resolve }
        this.active = run
        return { run, task: structuredClone(task) }
      })
      if (!run) return
      try {
        await this.processTask(run.task, run.run)
      } finally {
        this.active = undefined
        run.run.finish()
      }
    }
  }

  private async updateStorage(): Promise<void> {
    try {
      const bytes = await this.store.measureStorageBytes()
      if (bytes !== this.storageBytes) {
        this.storageBytes = bytes
        this.emit()
      }
    } catch { this.warn('Studio storage usage could not be read.') }
  }

  private async cleanFiles(remove: () => Promise<void>): Promise<void> {
    try { await remove() } catch { this.warn('Studio audio cleanup failed.') }
    await this.updateStorage()
  }

  private async processTask(task: StudioTask, run: StudioRun): Promise<void> {
    const { signal } = run.controller
    let currentLine: StudioTaskLine | undefined
    let stagedOutput = false
    try {
      signal.throwIfAborted()
      task.status = 'running'
      task.updatedAt = Date.now()
      await this.serialize(() => this.commitTask(task))

      const buffers: Buffer[] = []
      for (const [index, line] of task.lines.entries()) {
        signal.throwIfAborted()
        currentLine = line
        const key = studioLineCacheKey(line)
        let wav = await this.store.readLineCache(task.id, index, key)
        if (wav) {
          try { decodeWavMono16(wav) }
          catch {
            await this.store.clearLineCache(task.id, index)
            wav = null
          }
        }
        signal.throwIfAborted()
        if (!wav) {
          line.status = 'running'
          task.updatedAt = Date.now()
          await this.serialize(() => this.commitTask(task))
          signal.throwIfAborted()
          wav = await this.synthesizeLineWav(line, signal)
          signal.throwIfAborted()
          decodeWavMono16(wav)
          await this.store.writeLineCache(task.id, index, key, wav)
          await this.updateStorage()
        }
        buffers.push(wav)
        if (line.status !== 'completed') {
          line.status = 'completed'
          delete line.errorCode
          task.completedLines = task.lines.filter(item => item.status === 'completed').length
          task.updatedAt = Date.now()
          await this.serialize(() => this.commitTask(task))
        }
        currentLine = undefined
      }

      signal.throwIfAborted()
      const stitched = stitchWavSegments(task.lines.map((line, index) => ({
        wav: buffers[index]!,
        pauseAfterMs: line.pauseAfterMs,
        speed: studioPlaybackRate(line),
      })))
      await this.store.writeTaskOutput(task.id, stitched.wav)
      stagedOutput = true

      await this.serialize(async () => {
        signal.throwIfAborted()
        const now = Date.now()
        const archive: StudioTask = {
          ...task,
          status: 'completed',
          completedLines: task.lines.length,
          failedLines: 0,
          durationMs: stitched.durationMs,
          audioSize: stitched.wav.byteLength,
          completedAt: now,
          updatedAt: now,
          lines: task.lines.map((line, index) => {
            const { startMs, endMs, speechDurationMs } = stitched.timeline[index]!
            return { ...line, startMs, endMs, durationMs: speechDurationMs }
          }),
        }
        await this.commitTask(archive)
        stagedOutput = false
        await this.cleanFiles(() => this.store.clearLineCache(task.id))
      })
    } catch (error) {
      await this.serialize(async () => {
        if (stagedOutput) await this.cleanFiles(() => this.store.removeTaskOutput(task.id))
        const stop = run.stop
        const code = error instanceof TtsProviderError ? error.code : currentLine ? 'speech-synthesis-failed' : 'studio-stitch-failed'
        if (currentLine && currentLine.status !== 'completed') {
          currentLine.status = stop ? 'pending' : 'failed'
          if (stop) delete currentLine.errorCode
          else currentLine.errorCode = code
        }
        task.status = stop === 'cancel' ? 'canceled' : stop === 'pause' ? 'paused' : 'failed'
        if (stop) delete task.errorCode
        else task.errorCode = code
        task.completedLines = task.lines.filter(line => line.status === 'completed').length
        task.failedLines = task.lines.filter(line => line.status === 'failed').length
        task.updatedAt = Date.now()
        try {
          await this.commitTask(task)
          if (stop === 'cancel') await this.cleanFiles(() => this.store.deleteTaskFiles(task.id))
        } catch {
          task.status = 'failed'
          task.errorCode = 'studio-storage-write-failed'
          this.tasks = this.tasks.map(item => item.id === task.id ? task : item)
          this.emit()
          this.warn('Studio could not persist the task result.')
        }
      })
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true
    if (this.active) this.stopRun(this.active, 'pause')
    return this.disposal = this.finishDisposal()
  }

  private async finishDisposal(): Promise<void> {
    await this.loadPromise?.catch(() => {})
    await this.worker
    await this.changes
    const queued = this.tasks.filter(task => task.status === 'queued')
    if (queued.length) {
      const queuedIds = new Set(queued.map(task => task.id))
      const tasks = this.tasks.map(task => queuedIds.has(task.id)
        ? { ...task, status: 'paused' as const, updatedAt: Date.now() }
        : task)
      await this.commit({ tasks }).catch(() => this.warn('Studio could not pause its queued tasks.'))
    }
    this.listeners.clear()
    await this.releaseStore?.().catch(() => this.warn('Studio could not release its storage lock.'))
  }
}
