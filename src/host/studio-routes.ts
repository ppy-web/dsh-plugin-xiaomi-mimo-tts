import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  MAX_STUDIO_REQUEST_BODY_BYTES,
  TTS_STUDIO_AUDIO_ROUTE,
  TTS_STUDIO_EVENTS_ROUTE,
  TTS_STUDIO_PREVIEW_ROUTE,
  TTS_STUDIO_ROLES_ROUTE,
  TTS_STUDIO_SCRIPTS_ROUTE,
  TTS_STUDIO_STATE_ROUTE,
  TTS_STUDIO_TASKS_ROUTE,
} from '../constants.js'
import type { StudioLineInput, StudioRoleInput } from '../host-api.js'
import { StudioScriptParseError } from '../text/studio-script-parser.js'
import { isJsonContentType, json, readJsonBody, sameOriginRequest } from './http.js'
import { TtsProviderError } from './provider-error.js'

function methodAllowed(req: IncomingMessage, res: ServerResponse, allowed: readonly string[]): boolean {
  if (allowed.includes(req.method ?? '')) return true
  res.setHeader('allow', allowed.join(', '))
  json(res, 405, { error: 'method-not-allowed' })
  return false
}

async function readStudioBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await readJsonBody(req, MAX_STUDIO_REQUEST_BODY_BYTES)
  } catch (error) {
    const large = error instanceof Error && error.message === 'request-body-too-large'
    throw new TtsProviderError(large ? 'request-body-too-large' : 'invalid-json', undefined, large ? 413 : 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TtsProviderError('invalid-request', undefined, 400)
  }
  return body as Record<string, unknown>
}

function sendError(res: ServerResponse, error: unknown, fallbackCode = 'studio-operation-failed'): void {
  if (res.destroyed || res.writableEnded) return
  if (error instanceof StudioScriptParseError) {
    json(res, error.status, { error: error.code, lineNumber: error.lineNumber })
    return
  }
  if (error instanceof TtsProviderError) {
    json(res, error.status, { error: error.code })
    return
  }
  json(res, 500, { error: fallbackCode })
}

function safeDownloadFilename(title: string, taskId: string): string {
  const cleaned = title.replace(/[\r\n"\\/:*?<>|]+/gu, '-').trim().slice(0, 48) || `studio-${taskId.slice(0, 8)}`
  return `attachment; filename="studio-${taskId.slice(0, 8)}.wav"; filename*=UTF-8''${encodeURIComponent(`${cleaned}.wav`)}`
}

function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const match = header.match(/^bytes=(\d*)-(\d*)$/u)
  if (!match) return 'invalid'
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return 'invalid'
  let start = 0
  let end = size - 1
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
  } else {
    start = Number(rawStart)
    if (rawEnd) end = Number(rawEnd)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return 'invalid'
  }
  return { start, end: Math.min(size - 1, end) }
}

export function registerStudioRoutes(ctx: Context): void {
  const studio = ctx.speechStudio

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STUDIO_STATE_ROUTE,
    async handler(req, res) {
      if (!sameOriginRequest(req)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!methodAllowed(req, res, ['GET'])) return
      try {
        json(res, 200, await studio.snapshot())
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'xiaomi-mimo-tts: studio state route')

  ctx.effect(() => {
    const connections = new Set<() => void>()
    const unregister = ctx.webServer.register({
      kind: 'exact',
      path: TTS_STUDIO_EVENTS_ROUTE,
      async handler(req, res) {
        if (!sameOriginRequest(req)) { json(res, 403, { error: 'cross-origin-denied' }); return }
        if (!methodAllowed(req, res, ['GET'])) return
        res.statusCode = 200
        res.setHeader('content-type', 'text/event-stream; charset=utf-8')
        res.setHeader('cache-control', 'no-cache, no-store')
        res.setHeader('connection', 'keep-alive')
        res.flushHeaders?.()

        let closed = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const push = async () => {
          if (closed || res.destroyed || res.writableEnded) return
          try {
            const snap = await studio.snapshot()
            if (!closed && !res.destroyed && !res.writableEnded) {
              res.write(`data: ${JSON.stringify(snap)}\n\n`)
            }
          } catch { /* ignore transient snapshot errors on live stream */ }
        }

        const schedulePush = () => {
          if (closed || timer !== null) return
          timer = setTimeout(() => {
            timer = null
            void push()
          }, 40)
        }

        const unsubscribe = studio.subscribe(schedulePush)
        const heartbeat = setInterval(() => {
          if (!closed && !res.destroyed && !res.writableEnded) res.write(': ping\n\n')
        }, 25000)
        heartbeat.unref()

        const cleanup = () => {
          if (closed) return
          closed = true
          if (timer !== null) clearTimeout(timer)
          clearInterval(heartbeat)
          unsubscribe()
          connections.delete(close)
          res.off('close', cleanup)
        }
        const close = () => { cleanup(); res.end() }
        connections.add(close)
        res.once('close', cleanup)
        await push()
      },
    })
    return () => { unregister(); for (const close of connections) close() }
  }, 'xiaomi-mimo-tts: studio events route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STUDIO_ROLES_ROUTE,
    async handler(req, res) {
      if (!sameOriginRequest(req, true)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!methodAllowed(req, res, ['POST', 'DELETE'])) return
      try {
        if (req.method === 'DELETE') {
          const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id')?.trim() ?? ''
          if (!id) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          await studio.deleteRole(id)
          json(res, 200, { deleted: id, state: await studio.snapshot() })
          return
        }
        if (!isJsonContentType(req)) { json(res, 415, { error: 'json-required' }); return }
        const body = await readStudioBody(req)
        const role = await studio.saveRole(body as unknown as StudioRoleInput)
        json(res, 200, { role, state: await studio.snapshot() })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'xiaomi-mimo-tts: studio roles route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STUDIO_SCRIPTS_ROUTE,
    async handler(req, res) {
      if (!sameOriginRequest(req, true)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!methodAllowed(req, res, ['POST', 'DELETE'])) return
      try {
        if (req.method === 'DELETE') {
          const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id')?.trim() ?? ''
          if (!id) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          await studio.deleteScript(id)
          json(res, 200, { deleted: id, state: await studio.snapshot() })
          return
        }
        if (!isJsonContentType(req)) { json(res, 415, { error: 'json-required' }); return }
        const body = await readStudioBody(req)
        if (body.kind === 'import') {
          const imported = await studio.importScript({
            ...(typeof body.id === 'string' ? { id: body.id } : {}),
            title: typeof body.title === 'string' ? body.title : '',
            ...(typeof body.description === 'string' ? { description: body.description } : {}),
            text: typeof body.text === 'string' ? body.text : '',
            ...(typeof body.defaultNarratorName === 'string' ? { defaultNarratorName: body.defaultNarratorName } : {}),
          })
          json(res, 200, { ...imported, state: await studio.snapshot() })
          return
        }
        const script = await studio.saveScript({
          ...(typeof body.id === 'string' ? { id: body.id } : {}),
          title: typeof body.title === 'string' ? body.title : '',
          ...(typeof body.description === 'string' ? { description: body.description } : {}),
          lines: Array.isArray(body.lines) ? body.lines as StudioLineInput[] : [],
        })
        json(res, 200, { script, state: await studio.snapshot() })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'xiaomi-mimo-tts: studio scripts route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STUDIO_TASKS_ROUTE,
    async handler(req, res) {
      if (!sameOriginRequest(req, true)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!methodAllowed(req, res, ['POST', 'DELETE'])) return
      try {
        if (req.method === 'DELETE') {
          const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id')?.trim() ?? ''
          if (!id) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          await studio.deleteTask(id)
          json(res, 200, { deleted: id, state: await studio.snapshot() })
          return
        }
        if (!isJsonContentType(req)) { json(res, 415, { error: 'json-required' }); return }
        const body = await readStudioBody(req)
        const action = typeof body.action === 'string' ? body.action : 'start'
        const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
        let task
        if (action === 'start') {
          task = await studio.startTask({
            ...(typeof body.scriptId === 'string' ? { scriptId: body.scriptId } : {}),
            ...(typeof body.title === 'string' ? { title: body.title } : {}),
            ...(Array.isArray(body.lines) ? { lines: body.lines as StudioLineInput[] } : {}),
            ...(typeof body.autoStart === 'boolean' ? { autoStart: body.autoStart } : {}),
          })
        } else if (action === 'pause') {
          if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          task = await studio.pauseTask(taskId)
        } else if (action === 'resume') {
          if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          task = await studio.resumeTask(taskId)
        } else if (action === 'cancel') {
          if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          task = await studio.cancelTask(taskId)
        } else if (action === 'retry-line') {
          if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
          task = await studio.retryTaskLine(taskId, Number(body.lineIndex))
        } else {
          throw new TtsProviderError('invalid-request', undefined, 400)
        }
        json(res, action === 'start' ? 201 : 200, { task, state: await studio.snapshot() })
      } catch (error) {
        sendError(res, error)
      }
    },
  }), 'xiaomi-mimo-tts: studio tasks route')

  ctx.effect(() => {
    const requests = new Set<AbortController>()
    const unregister = ctx.webServer.register({
      kind: 'exact',
      path: TTS_STUDIO_PREVIEW_ROUTE,
      async handler(req, res) {
        if (!sameOriginRequest(req, true)) { json(res, 403, { error: 'cross-origin-denied' }); return }
        if (!methodAllowed(req, res, ['POST'])) return
        if (!isJsonContentType(req)) { json(res, 415, { error: 'json-required' }); return }
        const controller = new AbortController()
        const abort = () => controller.abort()
        requests.add(controller)
        req.once('aborted', abort)
        res.once('close', abort)
        try {
          const body = await readStudioBody(req)
          const audio = await studio.previewLine({
            roleId: typeof body.roleId === 'string' ? body.roleId : '',
            text: typeof body.text === 'string' ? body.text : '',
            ...(typeof body.speechInstruction === 'string' ? { speechInstruction: body.speechInstruction } : {}),
          }, controller.signal)
          controller.signal.throwIfAborted()
          res.setHeader('content-type', 'audio/wav')
          res.setHeader('content-length', audio.length)
          res.setHeader('cache-control', 'no-store')
          res.end(audio)
        } catch (error) {
          sendError(res, error, 'speech-synthesis-failed')
        } finally {
          requests.delete(controller)
          req.off('aborted', abort)
          res.off('close', abort)
        }
      },
    })
    return () => { unregister(); for (const request of requests) request.abort() }
  }, 'xiaomi-mimo-tts: studio preview route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STUDIO_AUDIO_ROUTE,
    async handler(req, res) {
      if (!sameOriginRequest(req)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!methodAllowed(req, res, ['GET', 'HEAD'])) return
      const params = new URL(req.url ?? '/', 'http://localhost').searchParams
      const taskId = params.get('taskId')?.trim() ?? ''
      const asDownload = params.get('download') === '1'
      if (!taskId) { json(res, 400, { error: 'invalid-studio-id' }); return }
      try {
        const audio = await studio.getTaskAudioFile(taskId)
        const file = await open(audio.path, 'r')
        try {
          const info = await file.stat()
          const range = parseByteRange(req.headers.range, info.size)
          res.setHeader('accept-ranges', 'bytes')
          res.setHeader('content-type', 'audio/wav')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('x-content-type-options', 'nosniff')
          if (asDownload) res.setHeader('content-disposition', safeDownloadFilename(audio.task.title, taskId))
          if (range === 'invalid') {
            res.statusCode = 416
            res.setHeader('content-range', `bytes */${info.size}`)
            res.end()
            return
          }
          if (range) {
            const length = range.end - range.start + 1
            res.statusCode = 206
            res.setHeader('content-range', `bytes ${range.start}-${range.end}/${info.size}`)
            res.setHeader('content-length', length)
            if (req.method === 'HEAD') res.end()
            else await pipeline(file.createReadStream({ start: range.start, end: range.end, autoClose: false }), res)
          } else {
            res.statusCode = 200
            res.setHeader('content-length', info.size)
            if (req.method === 'HEAD') res.end()
            else await pipeline(file.createReadStream({ autoClose: false }), res)
          }
        } finally {
          await file.close()
        }
      } catch (error) {
        if (res.destroyed || res.writableEnded) return
        if (res.headersSent) { res.destroy(); return }
        sendError(res, error, 'studio-audio-unavailable')
      }
    },
  }), 'xiaomi-mimo-tts: studio audio route')
}
