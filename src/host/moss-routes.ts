import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TTS_MOSS_PROBE_ROUTE, TTS_MOSS_SYNTH_ROUTE } from '../constants.js'
import { prepareTtsText } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import { json, readJsonBody } from './http.js'
import { probeMoss, synthesizeMoss } from './moss.js'
import { TtsProviderError } from './provider-error.js'

const PROBE_TIMEOUT_MS = 15_000
const PROBE_BODY_LIMIT = 16 * 1024
/** Long replies are split before synthesis, but direct callers may send a full settings-sized text. */
const SYNTH_BODY_LIMIT = 128 * 1024

function contentType(req: IncomingMessage): string {
  const value = req.headers['content-type']
  return Array.isArray(value) ? value.join(',') : value ?? ''
}

function requireJson(req: IncomingMessage, res: ServerResponse): boolean {
  if (/^application\/json(?:\s*;|$)/iu.test(contentType(req))) return true
  json(res, 415, { error: 'unsupported-media-type', message: 'Expected application/json.' })
  return false
}

function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST') return true
  res.setHeader('allow', 'POST')
  json(res, 405, { error: 'method-not-allowed' })
  return false
}

function errorBody(error: unknown): { status: number; body: { error: string; message: string } } {
  if (error instanceof TtsProviderError) {
    return { status: error.status, body: { error: error.code, message: error.message } }
  }
  return { status: 502, body: { error: 'moss-request-failed', message: 'MOSS request failed.' } }
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TtsProviderError('invalid-request', 'Expected an object.', 400)
  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function timeout(controller: AbortController, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => controller.abort(new TtsProviderError('moss-timeout', 'The MOSS service timed out.', 504)), ms)
}

export function registerMossRoutes(ctx: Context, current: () => ResolvedTtsSettings): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_MOSS_PROBE_ROUTE,
    async handler(req, res) {
      if (!requirePost(req, res) || !requireJson(req, res)) return
      const controller = new AbortController()
      const disconnect = (): void => { controller.abort(new TtsProviderError('moss-canceled', 'MOSS probe canceled.', 499)) }
      req.once('aborted', disconnect)
      res.once('close', disconnect)
      const timer = timeout(controller, PROBE_TIMEOUT_MS)
      try {
        const body = bodyRecord(await readJsonBody(req, PROBE_BODY_LIMIT))
        const baseURL = readString(body, 'baseURL')?.trim() || current().mossBaseURL
        const result = await probeMoss(baseURL, controller.signal)
        if (res.destroyed || res.writableEnded) return
        json(res, 200, { ok: true, ...result })
      } catch (error) {
        if (res.destroyed || res.writableEnded) return
        const detail = errorBody(error)
        json(res, detail.status, detail.body)
      } finally {
        clearTimeout(timer)
        req.off('aborted', disconnect)
        res.off('close', disconnect)
      }
    },
  }), 'xiaomi-mimo-tts: MOSS probe route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_MOSS_SYNTH_ROUTE,
    async handler(req, res) {
      if (!requirePost(req, res) || !requireJson(req, res)) return
      const controller = new AbortController()
      const disconnect = (): void => { controller.abort(new TtsProviderError('moss-canceled', 'MOSS synthesis canceled.', 499)) }
      req.once('aborted', disconnect)
      res.once('close', disconnect)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const body = bodyRecord(await readJsonBody(req, SYNTH_BODY_LIMIT))
        const settings = current()
        if (body.format !== undefined && body.format !== 'wav') throw new TtsProviderError('invalid-audio-format', 'MOSS synthesis returns WAV audio.', 400)
        const text = typeof body.text === 'string' ? prepareTtsText(body.text) : ''
        if (text.length === 0) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
        if (text.length > settings.maxTextLength) throw new TtsProviderError('text-too-long', 'Text exceeds the configured limit.', 413)
        const baseURL = readString(body, 'baseURL')?.trim() || settings.mossBaseURL
        const voice = readString(body, 'voice')?.trim() || settings.mossVoice
        timer = timeout(controller, settings.requestTimeoutMs)
        const audio = await synthesizeMoss(baseURL, voice, text, controller.signal, { maxAudioBytes: settings.maxWavAudioBytes })
        if (res.destroyed || res.writableEnded) return
        res.statusCode = 200
        res.setHeader('content-type', 'audio/wav')
        res.setHeader('content-length', audio.length)
        res.setHeader('cache-control', 'no-store')
        res.end(audio)
      } catch (error) {
        if (res.destroyed || res.writableEnded) return
        const detail = errorBody(error)
        json(res, detail.status, detail.body)
      } finally {
        if (timer !== undefined) clearTimeout(timer)
        req.off('aborted', disconnect)
        res.off('close', disconnect)
      }
    },
  }), 'xiaomi-mimo-tts: MOSS synthesis route')
}
