import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TTS_PORTRAITS_ROUTE, TTS_PORTRAIT_IMAGE_ROUTE } from '../constants.js'
import { PORTRAIT_IMAGE_TYPES, PORTRAIT_MAX_BYTES, PORTRAIT_SLOTS, clampPortraitScale, isPortraitSlot } from '../types/portrait.js'
import type { PortraitImageType, PortraitManifest, PortraitSlot } from '../types/portrait.js'
import { json, readJsonBody, sameOriginRequest, isJsonContentType } from './http.js'
import { writeAtomicJson } from './atomic-json.js'
import { SPEECH_DATA_ROOT } from './speech-files.js'

/** Custom portrait files live beside the plugin's other local data. */
export const PORTRAIT_ROOT = join(SPEECH_DATA_ROOT, 'portraits')
const INDEX_FILE_NAME = 'portrait-index.json'

function indexFile(root: string): string {
  return join(root, INDEX_FILE_NAME)
}

const EXTENSION_CONTENT_TYPE: Record<string, PortraitImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}
const STORED_EXTENSIONS = [...new Set([...Object.values(PORTRAIT_IMAGE_TYPES), 'jpeg'])]
const SLOT_FILE = /^(voice|autoplay|sound|provider)\.(png|jpe?g|webp|gif)$/u
/** Matches the reference plugin's accepted data URL shape. */
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/u

type PortraitIndex = Partial<Record<PortraitSlot, { scale?: number }>>

async function readIndex(root: string): Promise<PortraitIndex> {
  const raw = await readFile(indexFile(root), 'utf8').catch(() => null)
  if (raw === null) return {}
  try {
    const parsed = JSON.parse(raw) as PortraitIndex
    const index: PortraitIndex = {}
    for (const slot of PORTRAIT_SLOTS) {
      const scale = parsed?.[slot]?.scale
      if (typeof scale === 'number') index[slot] = { scale: clampPortraitScale(scale) }
    }
    return index
  } catch {
    return {}
  }
}

let writeQueue = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task)
  writeQueue = run.then(() => undefined, () => undefined)
  return run
}

async function writeIndex(root: string, index: PortraitIndex): Promise<void> {
  await writeAtomicJson(root, indexFile(root), index)
}

/** Read the current slot -> version/scale manifest; newest mtime wins if an old file lingers. */
async function readManifest(root: string): Promise<PortraitManifest> {
  const index = await readIndex(root)
  const slots = Object.fromEntries(PORTRAIT_SLOTS.map(slot => [slot, null])) as PortraitManifest['slots']
  const entries = await readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[]
    throw error
  })
  await Promise.all(entries.map(async name => {
    const match = SLOT_FILE.exec(name)
    if (match === null) return
    const info = await stat(join(root, name)).catch(() => null)
    if (info === null || !info.isFile()) return
    const slot = match[1] as PortraitSlot
    const version = String(Math.round(info.mtimeMs))
    const current = slots[slot]
    if (current === null || Number(version) > Number(current.version)) {
      slots[slot] = { version, scale: clampPortraitScale(index[slot]?.scale ?? 1) }
    }
  }))
  return { slots }
}

function sniffImageType(data: Buffer): PortraitImageType | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 4 && data.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function findSlotFile(root: string, slot: PortraitSlot): Promise<{ path: string; contentType: PortraitImageType } | null> {
  for (const [extension, contentType] of Object.entries(EXTENSION_CONTENT_TYPE)) {
    const path = join(root, `${slot}.${extension}`)
    const info = await stat(path).catch(() => null)
    if (info !== null && info.isFile()) return { path, contentType }
  }
  return null
}

async function removeSlotFiles(root: string, slot: PortraitSlot): Promise<void> {
  await Promise.all(STORED_EXTENSIONS.map(extension => rm(join(root, `${slot}.${extension}`), { force: true })))
}

type DecodedImage =
  | { ok: true; data: Buffer; contentType: PortraitImageType }
  | { ok: false; error: 'upload-too-large' | 'unsupported-image' }

/** Decode the reference-style data URL; distinguishes oversized payloads from unsupported images. */
function decodeImage(image: string): DecodedImage {
  const match = DATA_URL.exec(image)
  if (match === null) return { ok: false, error: 'unsupported-image' }
  const data = Buffer.from(match[2], 'base64')
  if (data.length === 0) return { ok: false, error: 'unsupported-image' }
  if (data.length > PORTRAIT_MAX_BYTES) return { ok: false, error: 'upload-too-large' }
  const sniffed = sniffImageType(data)
  return sniffed === null ? { ok: false, error: 'unsupported-image' } : { ok: true, data, contentType: sniffed }
}

async function handleLibrary(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  // Writes come from the local web client, which may omit Origin in the desktop shell;
  // sameOriginRequest() still rejects explicit cross-origin/cross-site requests and missing desktop headers on writes.
  if (!sameOriginRequest(req, req.method === 'POST' || req.method === 'DELETE')) {
    json(res, 403, { error: 'cross-origin-denied' })
    return
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const manifest = await readManifest(root)
    if (req.method === 'HEAD') {
      const payload = Buffer.from(JSON.stringify(manifest), 'utf8')
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('content-length', String(payload.byteLength))
      res.setHeader('cache-control', 'no-store')
      res.end()
      return
    }
    json(res, 200, manifest)
    return
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('allow', 'GET, HEAD, POST, DELETE')
    json(res, 405, { error: 'method-not-allowed' })
    return
  }

  let slot: PortraitSlot | null = null
  let image: string | null = null
  let scale: number | null = null
  if (req.method === 'POST') {
    if (!isJsonContentType(req)) {
      json(res, 415, { error: 'unsupported-media-type' })
      return
    }
    let body: unknown
    try {
      body = await readJsonBody(req, PORTRAIT_MAX_BYTES * 2)
    } catch (error) {
      const large = error instanceof Error && error.message === 'request-body-too-large'
      json(res, large ? 413 : 400, { error: large ? 'upload-too-large' : 'invalid-json' })
      return
    }
    const record = (body ?? {}) as Record<string, unknown>
    slot = isPortraitSlot(record.slot) ? record.slot : null
    image = typeof record.image === 'string' ? record.image : null
    scale = typeof record.scale === 'number' ? clampPortraitScale(record.scale) : null
  } else {
    const requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('slot')
    slot = isPortraitSlot(requested) ? requested : null
  }

  if (slot === null) {
    json(res, 400, { error: 'invalid-slot' })
    return
  }

  if (req.method === 'DELETE') {
    const manifest = await enqueueWrite(async () => {
      await removeSlotFiles(root, slot)
      const index = await readIndex(root)
      delete index[slot]
      await writeIndex(root, index)
      return readManifest(root)
    })
    json(res, 200, { ok: true, ...manifest })
    return
  }

  // Scale-only update keeps the uploaded image and only changes its zoom.
  if (image === null) {
    if (scale === null) {
      json(res, 400, { error: 'missing-image' })
      return
    }
    const result = await enqueueWrite(async () => {
      if (await findSlotFile(root, slot) === null) return null
      const index = await readIndex(root)
      index[slot] = { scale }
      await writeIndex(root, index)
      return readManifest(root)
    })
    if (result === null) {
      json(res, 404, { error: 'portrait-missing' })
      return
    }
    json(res, 200, { ok: true, ...result })
    return
  }

  const decoded = decodeImage(image)
  if (!decoded.ok) {
    json(res, decoded.error === 'upload-too-large' ? 413 : 415, { error: decoded.error })
    return
  }

  const manifest = await enqueueWrite(async () => {
    await mkdir(root, { recursive: true })
    await removeSlotFiles(root, slot)
    await writeFile(join(root, `${slot}.${PORTRAIT_IMAGE_TYPES[decoded.contentType]}`), decoded.data, { mode: 0o600 })
    const index = await readIndex(root)
    index[slot] = { scale: scale ?? index[slot]?.scale ?? 1 }
    await writeIndex(root, index)
    return readManifest(root)
  })
  json(res, 200, { ok: true, ...manifest })
}

async function handleImage(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    json(res, 405, { error: 'method-not-allowed' })
    return
  }
  if (!sameOriginRequest(req)) {
    json(res, 403, { error: 'cross-origin-denied' })
    return
  }
  const slot = new URL(req.url ?? '/', 'http://localhost').searchParams.get('slot')
  if (!isPortraitSlot(slot)) {
    json(res, 400, { error: 'invalid-slot' })
    return
  }
  const found = await findSlotFile(root, slot)
  const data = found === null ? null : await readFile(found.path).catch(() => null)
  if (found === null || data === null) {
    json(res, 404, { error: 'portrait-missing' })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', found.contentType)
  res.setHeader('content-length', String(data.byteLength))
  res.setHeader('cache-control', 'public, max-age=31536000, immutable')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(req.method === 'HEAD' ? undefined : data)
}

/** Register the custom portrait library routes; failures stay JSON instead of escaping the handler. */
export function registerPortraitRoutes(ctx: Context, root = PORTRAIT_ROOT): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_PORTRAITS_ROUTE,
    async handler(req, res) {
      try { await handleLibrary(req, res, root) } catch { if (!res.headersSent) json(res, 500, { error: 'portrait-store-failed' }); else res.end() }
    },
  }), 'xiaomi-mimo-tts: custom portrait library')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_PORTRAIT_IMAGE_ROUTE,
    async handler(req, res) {
      try { await handleImage(req, res, root) } catch { if (!res.headersSent) json(res, 500, { error: 'portrait-store-failed' }); else res.end() }
    },
  }), 'xiaomi-mimo-tts: custom portrait image')
}
