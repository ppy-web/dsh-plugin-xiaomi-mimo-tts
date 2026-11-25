import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SPEECH_DATA_ROOT } from './speech-files.js'
import { writeAtomicFile, writeAtomicJson } from './atomic-json.js'
import { releaseFileLock, staleFileLockOwner } from './file-lock.js'
import { TtsProviderError } from './provider-error.js'
import { STUDIO_MAX_STORAGE_BYTES, createBuiltinStudioRoles } from '../types/studio.js'
import type { StudioRole, StudioScript, StudioTask, StudioTaskLine } from '../types/studio.js'
import { STUDIO_BUILTIN_CATALOG_VERSION, createBuiltinStudioScripts, migrateBuiltinStudioPresets } from '../studio-presets.js'

export const STUDIO_DATA_ROOT = join(SPEECH_DATA_ROOT, 'studio')
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/u

export interface StudioRecords {
  roles: StudioRole[]
  scripts: StudioScript[]
  tasks: StudioTask[]
}

interface PersistedStudioManifest extends StudioRecords {
  version: 1
  builtinCatalogVersion?: number
}

function notFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function fileSize(filename: string): Promise<number> {
  try { return (await stat(filename)).size }
  catch (error) { if (!notFound(error)) throw error; return 0 }
}

async function fileExists(filename: string): Promise<boolean> {
  try { return (await stat(filename)).isFile() }
  catch (error) { if (!notFound(error)) throw error; return false }
}

async function lockStudioRoot(root: string): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true })
  const lock = join(root, 'manifest.lock')
  const token = `${process.pid}:${randomUUID()}`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeFile(lock, token, { flag: 'wx', mode: 0o600 })
      return async () => {
        if (await readFile(lock, 'utf8') === token) await rm(lock, { force: true })
      }
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      const holder = await staleFileLockOwner(lock, 1000)
      if (holder === undefined || !await releaseFileLock(lock, holder)) break
    }
  }
  throw new TtsProviderError('studio-store-busy', 'This Studio storage is already open in another process.', 409)
}

function assertSafeId(id: string): void {
  if (!SAFE_ID_PATTERN.test(id)) throw new TtsProviderError('invalid-studio-id', 'Invalid Studio identifier.', 400)
}

async function directoryBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  let total = 0
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(full)
    else if (entry.isFile()) total += await fileSize(full)
  }
  return total
}

export function studioLineCacheKey(line: Pick<StudioTaskLine, 'provider' | 'model' | 'voice' | 'voiceDesignPrompt' | 'speechInstruction' | 'voiceRate' | 'text'>): string {
  return createHash('sha256').update(JSON.stringify({
    provider: line.provider,
    model: line.model,
    voice: line.voice,
    voiceDesignPrompt: line.voiceDesignPrompt ?? '',
    speechInstruction: line.speechInstruction ?? '',
    voiceRate: line.voiceRate,
    text: line.text,
  })).digest('hex').slice(0, 16)
}

export class StudioDiskStore {
  private directory: string

  constructor(
    private readonly preferredRoot = STUDIO_DATA_ROOT,
    readonly maxStorageBytes = STUDIO_MAX_STORAGE_BYTES,
    private readonly legacy?: { root: string; profile: string },
  ) {
    this.directory = preferredRoot
  }

  get root(): string { return this.directory }
  get manifestPath(): string { return join(this.root, 'manifest.json') }
  get cacheRoot(): string { return join(this.root, 'cache') }
  get outputsRoot(): string { return join(this.root, 'outputs') }

  static forProfile(profileBase: string, base = STUDIO_DATA_ROOT): StudioDiskStore {
    const profile = createHash('sha256').update(process.platform === 'win32' ? profileBase.toLowerCase() : profileBase).digest('hex')
    return new StudioDiskStore(join(base, 'profiles', profile), STUDIO_MAX_STORAGE_BYTES, { root: base, profile })
  }

  /** Assign former shared storage once, without copying or moving archived audio. */
  async open(): Promise<() => Promise<void>> {
    this.directory = this.preferredRoot
    const legacy = this.legacy
    if (!legacy || !await fileExists(join(legacy.root, 'manifest.json')) || await fileExists(join(this.preferredRoot, 'manifest.json'))) {
      return lockStudioRoot(this.root)
    }
    const marker = join(legacy.root, 'profile.json')
    const readOwner = async (): Promise<string | undefined> => {
      try {
        const owner: unknown = JSON.parse(await readFile(marker, 'utf8'))
        if (typeof owner !== 'string' || !/^[a-f0-9]{64}$/u.test(owner)) {
          throw new TtsProviderError('studio-store-corrupt', 'Studio profile marker is corrupt.', 409)
        }
        return owner
      } catch (error) {
        if (error instanceof SyntaxError) throw new TtsProviderError('studio-store-corrupt', 'Studio profile marker is corrupt.', 409)
        if (!notFound(error)) throw error
      }
    }
    const existingOwner = await readOwner()
    if (existingOwner !== undefined) {
      this.directory = existingOwner === legacy.profile ? legacy.root : this.preferredRoot
      return lockStudioRoot(this.root)
    }
    const release = await lockStudioRoot(legacy.root)
    try {
      const owner = await readOwner()
      if (owner === undefined) await writeAtomicJson(legacy.root, marker, legacy.profile)
      if (owner === undefined || owner === legacy.profile) {
        this.directory = legacy.root
        return release
      }
    } catch (error) {
      await release()
      throw error
    }
    await release()
    this.directory = this.preferredRoot
    return lockStudioRoot(this.root)
  }

  async load(): Promise<StudioRecords & { storageBytes: number }> {
    const now = Date.now()
    let manifest: PersistedStudioManifest
    try {
      manifest = JSON.parse(await readFile(this.manifestPath, 'utf8')) as PersistedStudioManifest
    } catch (error) {
      if (notFound(error)) manifest = {
        version: 1,
        builtinCatalogVersion: STUDIO_BUILTIN_CATALOG_VERSION,
        roles: createBuiltinStudioRoles(now),
        scripts: createBuiltinStudioScripts(now),
        tasks: [],
      }
      else if (error instanceof SyntaxError) throw new TtsProviderError('studio-store-corrupt', 'Studio manifest is corrupt.', 409)
      else throw error
    }
    if (manifest?.version !== 1 || !Array.isArray(manifest.roles) || !Array.isArray(manifest.scripts) || !Array.isArray(manifest.tasks)) {
      throw new TtsProviderError('studio-store-corrupt', 'Studio manifest is corrupt.', 409)
    }
    const { tasks } = manifest
    const previousCatalogVersion = manifest.builtinCatalogVersion ?? 0
    let dirty = previousCatalogVersion < STUDIO_BUILTIN_CATALOG_VERSION
    const { roles, scripts } = dirty
      ? migrateBuiltinStudioPresets(manifest.roles, manifest.scripts, previousCatalogVersion, now)
      : manifest
    for (const task of tasks) {
      if (task.status === 'running' || task.status === 'queued') {
        task.status = 'paused'
        task.updatedAt = now
        dirty = true
      }
      if (Array.isArray(task.lines)) {
        for (const line of task.lines) {
          if (line.status === 'running') {
            line.status = 'pending'
            dirty = true
          }
        }
        task.completedLines = task.lines.filter(line => line.status === 'completed').length
        task.failedLines = task.lines.filter(line => line.status === 'failed').length
      }
    }

    if (dirty) await this.saveManifest({ roles, scripts, tasks })
    for (const task of tasks) {
      if (task.status === 'canceled') {
        await this.deleteTaskFiles(task.id).catch(() => {})
      } else if (task.status === 'completed' && await fileExists(this.outputPath(task.id))) {
        await this.clearLineCache(task.id).catch(() => {})
      }
    }
    const storageBytes = await this.measureStorageBytes()
    return { roles, scripts, tasks, storageBytes }
  }

  async saveManifest(state: StudioRecords): Promise<void> {
    const payload: PersistedStudioManifest = {
      version: 1,
      builtinCatalogVersion: STUDIO_BUILTIN_CATALOG_VERSION,
      roles: state.roles,
      scripts: state.scripts,
      tasks: state.tasks,
    }
    await writeAtomicJson(this.root, this.manifestPath, payload)
  }

  async measureStorageBytes(): Promise<number> {
    const [cacheBytes, outputBytes] = await Promise.all([
      directoryBytes(this.cacheRoot),
      directoryBytes(this.outputsRoot),
    ])
    return cacheBytes + outputBytes
  }

  private lineCachePath(taskId: string, index: number, key: string): string {
    assertSafeId(taskId)
    assertSafeId(key)
    return join(this.cacheRoot, taskId, `${String(index).padStart(4, '0')}-${key}.wav`)
  }

  outputPath(taskId: string): string {
    assertSafeId(taskId)
    return join(this.outputsRoot, `${taskId}.wav`)
  }

  async readLineCache(taskId: string, index: number, key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.lineCachePath(taskId, index, key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async writeLineCache(taskId: string, index: number, key: string, wav: Buffer): Promise<void> {
    const current = await this.measureStorageBytes()
    if (current + wav.byteLength > this.maxStorageBytes) {
      throw new TtsProviderError('studio-storage-limit-exceeded', 'Studio disk storage limit exceeded.', 507)
    }
    const file = this.lineCachePath(taskId, index, key)
    const dir = join(this.cacheRoot, taskId)
    await writeAtomicFile(dir, file, wav)
    const prefix = `${String(index).padStart(4, '0')}-`
    const existing = await readdir(dir)
    const filename = `${prefix}${key}.wav`
    await Promise.all(existing.filter(name => name !== filename && name.startsWith(prefix)).map(name => rm(join(dir, name), { force: true })))
  }

  async clearLineCache(taskId: string, index?: number): Promise<void> {
    assertSafeId(taskId)
    const dir = join(this.cacheRoot, taskId)
    if (index === undefined) {
      await rm(dir, { recursive: true, force: true })
      return
    }
    const prefix = `${String(index).padStart(4, '0')}-`
    const existing = await readdir(dir).catch(error => {
      if (notFound(error)) return []
      throw error
    })
    await Promise.all(existing.filter(name => name.startsWith(prefix)).map(name => rm(join(dir, name), { force: true })))
  }

  async writeTaskOutput(taskId: string, wav: Buffer): Promise<string> {
    assertSafeId(taskId)
    const cacheDir = join(this.cacheRoot, taskId)
    const outPath = this.outputPath(taskId)
    const [totalBytes, taskCacheBytes, existingOutput] = await Promise.all([
      this.measureStorageBytes(),
      directoryBytes(cacheDir),
      fileSize(outPath),
    ])
    // The caller keeps the cache until the completed manifest has been committed.
    if (Math.max(0, totalBytes - taskCacheBytes - existingOutput) + wav.byteLength > this.maxStorageBytes) {
      throw new TtsProviderError('studio-storage-limit-exceeded', 'Studio disk storage limit exceeded.', 507)
    }
    await writeAtomicFile(this.outputsRoot, outPath, wav)
    return outPath
  }

  async removeTaskOutput(taskId: string): Promise<void> {
    await rm(this.outputPath(taskId), { force: true })
  }

  async deleteTaskFiles(taskId: string): Promise<void> {
    assertSafeId(taskId)
    await Promise.all([
      rm(join(this.cacheRoot, taskId), { recursive: true, force: true }),
      this.removeTaskOutput(taskId),
    ])
  }
}
