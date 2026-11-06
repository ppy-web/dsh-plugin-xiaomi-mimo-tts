import { timingSafeEqual } from 'node:crypto'
import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SpeechRequest } from '../host-api.js'
import { TTS_CAPABILITIES_ROUTE, TTS_DOWNLOAD_ROUTE, TTS_EXPORT_ROUTE } from '../constants.js'
import { AudioDownloads } from './audio-downloads.js'
import { json, readJsonBody } from './http.js'
import { TtsProviderError } from './provider-error.js'
import { SPEECH_FILE_TTL_MS } from './speech-files.js'

/** All management calls require a separate Host token; browser calls also stay same-origin. */
function authorize(req: IncomingMessage, res: ServerResponse, token: string): boolean {
  const origin = req.headers.origin
  const fetchSite = req.headers['sec-fetch-site']
  let sameOrigin = false
  if (origin !== undefined) {
    try {
      const parsed = new URL(origin)
      sameOrigin = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host
    } catch { /* reject malformed origins */ }
    if (!sameOrigin) { json(res, 403, { error: 'cross-origin-denied' }); return false }
  }
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
    json(res, 403, { error: 'cross-origin-denied' })
    return false
  }
  const supplied = req.headers.authorization?.match(/^Bearer (.+)$/iu)?.[1] ?? ''
  const expected = Buffer.from(token.trim())
  const actual = Buffer.from(supplied)
  if (expected.length === 0) { json(res, 503, { error: 'open-api-disabled' }); return false }
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true
  res.setHeader('www-authenticate', 'Bearer')
  json(res, 401, { error: 'open-api-unauthorized' })
  return false
}

function method(req: IncomingMessage, res: ServerResponse, allowed: string[]): boolean {
  if (allowed.includes(req.method ?? '')) return true
  res.setHeader('allow', allowed.join(', '))
  json(res, 405, { error: 'method-not-allowed' })
  return false
}

export function registerOpenApiRoutes(ctx: Context, currentToken: () => string, downloads = new AudioDownloads()): void {
  const controllers = new Set<AbortController>()
  ctx.effect(() => {
    const timer = setInterval(() => { void downloads.sweep().catch(() => ctx.logger.warn('Speech download cleanup failed.')) }, 60 * 60 * 1000)
    timer.unref()
    return async () => {
      clearInterval(timer)
      for (const controller of controllers) controller.abort()
      await downloads.dispose()
    }
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: TTS_CAPABILITIES_ROUTE,
    handler(req, res) {
      if (!method(req, res, ['GET']) || !authorize(req, res, currentToken())) return
      json(res, 200, {
        ...ctx.speechSynthesis.capabilities(),
        http: { formats: ctx.speechSynthesis.capabilities().formats.filter(format => format !== 'silk'), exportFormats: ctx.speechSynthesis.capabilities().formats, downloadTtlMs: SPEECH_FILE_TTL_MS },
      })
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: TTS_EXPORT_ROUTE,
    async handler(req, res) {
      if (!method(req, res, ['POST']) || !authorize(req, res, currentToken())) return
      if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        json(res, 415, { error: 'json-required' })
        return
      }
      const controller = new AbortController()
      controllers.add(controller)
      const abort = () => controller.abort()
      req.once('aborted', abort)
      res.once('close', abort)
      try {
        let body: unknown
        try { body = await readJsonBody(req) } catch (error) {
          const large = error instanceof Error && error.message === 'request-body-too-large'
          throw new TtsProviderError(large ? 'request-body-too-large' : 'invalid-json', undefined, large ? 413 : 400)
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TtsProviderError('invalid-request', undefined, 400)
        // Explicit allowlist: callers cannot supply credentials, addresses, paths or cancellation objects.
        const input = body as Record<string, unknown>
        const allowed = ['text', 'provider', 'engineRevision', 'model', 'voice', 'voiceDesignPrompt', 'speechInstruction', 'voiceRate', 'format', 'maxDurationMs']
        if (Object.keys(input).some(key => !allowed.includes(key))) throw new TtsProviderError('unknown-request-field', undefined, 400)
        if (input.format !== undefined && !['mp3', 'wav', 'silk'].includes(input.format as string)) throw new TtsProviderError('invalid-audio-format', undefined, 400)
        const artifact = await ctx.speechSynthesis.exportAudio({ ...input, signal: controller.signal } as SpeechRequest)
        if (controller.signal.aborted) {
          await artifact.remove()
          throw new TtsProviderError('speech-service-disposed', undefined, 503)
        }
        const download = await downloads.publish(artifact)
        if (controller.signal.aborted) {
          await downloads.revoke(download.audioId)
          throw new TtsProviderError('speech-service-disposed', undefined, 503)
        }
        json(res, 201, download)
      } catch (error) {
        if (!res.destroyed && !res.writableEnded) {
          // Error codes are sufficient here; upstream prose may contain private configuration.
          if (controller.signal.aborted) json(res, 503, { error: 'speech-service-disposed' })
          else json(res, error instanceof TtsProviderError ? error.status : 502, { error: error instanceof TtsProviderError ? error.code : 'speech-export-failed' })
        }
      } finally {
        controllers.delete(controller)
        req.off('aborted', abort)
        res.off('close', abort)
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: `${TTS_DOWNLOAD_ROUTE}/`,
    async handler(req, res) {
      if (!method(req, res, ['GET', 'HEAD'])) return
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const prefix = `${TTS_DOWNLOAD_ROUTE}/`
      const audioId = pathname.slice(pathname.lastIndexOf(prefix) + prefix.length)
      if (!/^[a-f0-9]{64}$/u.test(audioId)) { json(res, 404, { error: 'audio-not-found' }); return }
      try {
        const artifact = await downloads.get(audioId)
        if (!artifact) { json(res, 404, { error: 'audio-not-found' }); return }
        const file = await open(artifact.path, 'r')
        try {
          const info = await file.stat()
          res.setHeader('content-type', artifact.contentType)
          res.setHeader('content-length', info.size)
          res.setHeader('content-disposition', `attachment; filename="speech-${audioId}.${artifact.format}"`)
          res.setHeader('cache-control', 'no-store')
          res.setHeader('referrer-policy', 'no-referrer')
          res.setHeader('x-content-type-options', 'nosniff')
          if (req.method === 'HEAD') res.end()
          else await pipeline(file.createReadStream({ autoClose: false }), res)
        } finally { await file.close() }
      } catch (error) {
        if (res.destroyed || res.writableEnded) return
        if (res.headersSent) { res.destroy(); return }
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
        json(res, missing ? 404 : 500, { error: missing ? 'audio-not-found' : 'audio-download-failed' })
      }
    },
  }))
}
