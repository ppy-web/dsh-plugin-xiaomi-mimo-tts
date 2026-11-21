import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TTS_MOSS_PROBE_ROUTE, TTS_MOSS_SYNTH_ROUTE } from '../constants.js'
import { normalizeMossBaseURL } from '../moss.js'
import { prepareTtsText } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import { json, readJsonBody, sameOriginRequest, isJsonContentType } from './http.js'
import { probeMoss, synthesizeMoss } from './moss.js'
import { TtsProviderError } from './provider-error.js'

const PROBE_TIMEOUT_MS = 15_000
const PROBE_BODY_LIMIT = 16 * 1024
/** Long replies are split before synthesis, but direct callers may send a full settings-sized text. */
const SYNTH_BODY_LIMIT = 128 * 1024
const DRAFT_PROBE_TTL_MS = 5 * 60 * 1000
const MAX_DRAFT_PROBES = 16

function requireJson(req: IncomingMessage, res: ServerResponse): boolean {
  if (isJsonContentType(req)) return true
  json(res, 415, { error: 'unsupported-media-type', message: 'Expected application/json.' })
  return false
}

function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    json(res, 405, { error: 'method-not-allowed' })
    return false
  }
  if (!sameOriginRequest(req, true)) {
    json(res, 403, { error: 'cross-origin-denied' })
    return false
  }
  return true
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

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  return host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1' || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/u.test(host)
}

function mossEndpoint(raw: string): string {
  try { return normalizeMossBaseURL(raw) }
  catch { throw new TtsProviderError('moss-invalid-url', 'Enter a valid http:// or https:// MOSS service URL.', 400) }
}

async function readJsonObject(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = await readJsonBody(req, limit)
  } catch (error) {
    const large = error instanceof Error && error.message === 'request-body-too-large'
    throw new TtsProviderError(large ? 'request-body-too-large' : 'invalid-json', large ? 'MOSS request body is too large.' : 'Expected a JSON object.', large ? 413 : 400)
  }
  return bodyRecord(parsed)
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function timeout(controller: AbortController, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => controller.abort(new TtsProviderError('moss-timeout', 'The MOSS service timed out.', 504)), ms)
}

export function registerMossRoutes(ctx: Context, current: () => ResolvedTtsSettings): void {
  const draftProbes = new Map<string, { expiresAt: number; voices: Set<string> }>()
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
        const body = await readJsonObject(req, PROBE_BODY_LIMIT)
        const saved = current().mossBaseURL
        const target = mossEndpoint(readString(body, 'baseURL')?.trim() || saved)
        const loopback = isLoopbackHost(new URL(target).hostname)
        if (!loopback && target !== mossEndpoint(saved)) {
          throw new TtsProviderError('moss-invalid-url', 'Save the remote MOSS address before probing.', 400)
        }
        const result = await probeMoss(target, controller.signal)
        if (res.destroyed || res.writableEnded) return
        if (loopback && result.voices.length > 0) {
          draftProbes.delete(target)
          if (draftProbes.size >= MAX_DRAFT_PROBES) draftProbes.delete(draftProbes.keys().next().value!)
          draftProbes.set(target, { expiresAt: Date.now() + DRAFT_PROBE_TTL_MS, voices: new Set(result.voices.map(voice => voice.id)) })
        }
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
        const body = await readJsonObject(req, SYNTH_BODY_LIMIT)
        const settings = current()
        if (body.format !== undefined && body.format !== 'wav') throw new TtsProviderError('invalid-audio-format', 'MOSS synthesis returns WAV audio.', 400)
        const text = typeof body.text === 'string' ? prepareTtsText(body.text) : ''
        if (text.length === 0) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
        if (text.length > settings.maxTextLength) throw new TtsProviderError('text-too-long', 'Text exceeds the configured limit.', 413)
        const configured = mossEndpoint(settings.mossBaseURL)
        const requested = readString(body, 'baseURL')?.trim()
        const target = requested ? mossEndpoint(requested) : configured
        const voice = readString(body, 'voice')?.trim() || settings.mossVoice
        if (target !== configured) {
          const probe = draftProbes.get(target)
          if (!probe || probe.expiresAt <= Date.now() || !probe.voices.has(voice)) {
            throw new TtsProviderError('moss-invalid-url', 'Probe the local MOSS address and select a listed voice, or save the address first.', 400)
          }
        }
        timer = timeout(controller, settings.requestTimeoutMs)
        const audio = await synthesizeMoss(target, voice, text, controller.signal, { maxAudioBytes: settings.maxWavAudioBytes })
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
