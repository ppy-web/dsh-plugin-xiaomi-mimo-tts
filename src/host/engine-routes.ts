import type { Context } from '@deepseek-ai/cordis'
import { TTS_DESKTOP_WRITE_HEADER, TTS_ENGINE_EVENTS_ROUTE, TTS_ENGINE_STATE_ROUTE, TTS_ENGINE_SELECTION_ROUTE } from '../constants.js'
import { json, readJsonBody } from './http.js'
import { TtsProviderError } from './provider-error.js'

/** Browser-only metadata: reject cross-origin reads, including requests without an Origin but marked cross-site. */
export function registerEngineRoutes(ctx: Context): void {
  const connections = new Set<() => void>()
  ctx.effect(() => () => { for (const close of connections) close(); connections.clear() })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: TTS_ENGINE_SELECTION_ROUTE,
    async handler(req, res) {
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); json(res, 405, { error: 'method-not-allowed' }); return }
      const origin = req.headers.origin
      let allowed = false
      if (origin === undefined) {
        // The desktop shell checks the app origin, then strips browser origin
        // metadata. Cross-site HTML forms cannot set this marker header.
        allowed = req.headers['sec-fetch-site'] === undefined && req.headers[TTS_DESKTOP_WRITE_HEADER] === '1'
      } else {
        try { const parsed = new URL(origin); allowed = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host } catch { /* rejected below */ }
      }
      if (!allowed || ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!String(req.headers['content-type']).startsWith('application/json')) { json(res, 415, { error: 'invalid-content-type' }); return }
      const controller = new AbortController()
      const close = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', close)
      try {
        const body = await readJsonBody(req, 16384) as Record<string, unknown>
        const selection = body?.selection as Record<string, unknown>
        const switching = body?.configurationId !== undefined
        if (!body || typeof body.provider !== 'string' || !body.provider.startsWith('external:') || !Number.isSafeInteger(body.engineRevision)
          || Object.keys(body).some(key => !['provider', 'engineRevision', 'selection', 'configurationId'].includes(key))
          || (switching ? selection !== undefined || typeof body.configurationId !== 'string' || !body.configurationId.trim() || body.configurationId.length > 200
            : !selection || typeof selection.model !== 'string' || typeof selection.voice !== 'string'
              || (selection.speechInstruction !== undefined && typeof selection.speechInstruction !== 'string')
              || Object.keys(selection).some(key => !['model', 'voice', 'speechInstruction'].includes(key)))) {
          json(res, 400, { error: 'external-selection-invalid' }); return
        }
        const state = await ctx.speechSynthesis.configureProvider({ provider: body.provider as `external:${string}`, engineRevision: body.engineRevision as number,
          ...(switching ? { configurationId: body.configurationId as string }
            : { selection: { model: selection.model as string, voice: selection.voice as string, ...(selection.speechInstruction === undefined ? {} : { speechInstruction: selection.speechInstruction as string }) } }), signal: controller.signal })
        json(res, 200, state)
      } catch (error) { json(res, error instanceof TtsProviderError ? error.status : 400, { error: error instanceof TtsProviderError ? error.code : 'external-selection-invalid' }) }
      finally { res.off('close', close) }
    },
  }))
  for (const events of [false, true]) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: events ? TTS_ENGINE_EVENTS_ROUTE : TTS_ENGINE_STATE_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET') { res.setHeader('allow', 'GET'); json(res, 405, { error: 'method-not-allowed' }); return }
      const origin = req.headers.origin
      let allowed = origin === undefined
      if (origin !== undefined) {
        try { const url = new URL(origin); allowed = ['http:', 'https:'].includes(url.protocol) && url.host === req.headers.host } catch { allowed = false }
      }
      if (!allowed || ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) { json(res, 403, { error: 'cross-origin-denied' }); return }
      res.setHeader('cache-control', 'no-store')
      if (!events) { json(res, 200, ctx.speechSynthesis.engineState()); return }
      res.setHeader('content-type', 'text/event-stream; charset=utf-8')
      res.setHeader('x-accel-buffering', 'no')
      const send = () => {
        if (res.destroyed || res.writableEnded) return
        if (res.writableLength > 65536) { res.destroy(); return }
        res.write(`data: ${JSON.stringify(ctx.speechSynthesis.engineState())}\n\n`)
      }
      const off = ctx.speechSynthesis.subscribeEngine(send)
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n') }, 25000)
      heartbeat.unref()
      const close = () => { off(); clearInterval(heartbeat); connections.delete(close); if (!res.writableEnded) res.end() }
      connections.add(close)
      res.once('close', close)
      send()
    },
  }))
}
