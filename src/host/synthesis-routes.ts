import type { Context } from '@deepseek-ai/cordis'
import type { ServerResponse } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import { TTS_ROUTE, TTS_STREAM_ROUTE, TTS_DUPLEX_ROUTE } from '../constants.js'
import { prepareTtsText, resolveTtsSettings } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import { json, readJsonBody } from './http.js'
import type { SynthesizeBody } from './synthesis.js'
import { synthesisOptions, validateSynthesisSettings, completeAudioFormat, CompleteAudioResponseError } from './validation.js'
import { TtsProviderError, safeProviderError } from './provider-error.js'
import { DoubaoSession, synthesizeDoubao } from './doubao.js'
import type { DoubaoSessionOptions } from './doubao.js'
import { streamXiaomi } from './xiaomi.js'
import { prepareSpeechRequest, synthesizeCompleteAudio } from './complete-synthesis.js'

function responseError(res: ServerResponse, error: unknown, settings: ResolvedTtsSettings): void {
  if (res.destroyed || res.writableEnded) return
  const detail = error instanceof CompleteAudioResponseError ? { error: error.code, message: error.code } : safeProviderError(error, [settings.apiKey, settings.doubaoApiKey])
  if (res.headersSent) {
    res.end(`data: ${JSON.stringify({ error: detail.message })}\n\n`)
  } else json(res, error instanceof TtsProviderError ? error.status : 502, { ...detail, provider: settings.provider })
}

export function registerSynthesisRoutes(ctx: Context, current: () => ResolvedTtsSettings, runtime: { connectDoubao?: NonNullable<DoubaoSessionOptions['connect']> } = {}): void {
  const connection = runtime.connectDoubao ? { connect: runtime.connectDoubao } : {}
  for (const stream of [false, true]) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: stream ? TTS_STREAM_ROUTE : TTS_ROUTE,
    async handler(req, res) {
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); json(res, 405, { error: 'method-not-allowed' }); return }
      let settings = resolveTtsSettings(current())
      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | undefined
      let disconnected = false
      const abort = () => { disconnected = true; controller.abort() }
      req.once('aborted', abort)
      res.once('close', abort)
      try {
        let body: SynthesizeBody
        try { body = await readJsonBody(req) as SynthesizeBody } catch (error) {
          throw new TtsProviderError(error instanceof Error && error.message === 'request-body-too-large' ? 'request-body-too-large' : 'invalid-json', 'Invalid synthesis request.', error instanceof Error && error.message === 'request-body-too-large' ? 413 : 400)
        }
        const prepared = prepareSpeechRequest(settings, body)
        settings = prepared.settings
        const text = prepared.text
        if (!stream && body.format !== undefined && body.format !== 'mp3' && body.format !== 'wav') throw new TtsProviderError('invalid-audio-format', 'Select MP3 or WAV.', 400)
        // Doubao owns an activity-based timeout; Xiaomi retains its total request timeout.
        if (settings.provider === 'xiaomi') timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs)
        if (stream) {
          const begin = () => {
            res.statusCode = 200
            res.setHeader('content-type', 'text/event-stream; charset=utf-8')
            res.setHeader('cache-control', 'no-store')
            res.setHeader('x-accel-buffering', 'no')
          }
          const forward = (data: Uint8Array | string) => {
            if (res.destroyed) throw new TtsProviderError('tts-canceled')
            if (res.writableLength + Buffer.byteLength(data) > settings.maxPausedPcmBytes) throw new TtsProviderError('stream-buffer-limit')
            res.write(data)
          }
          if (settings.provider === 'doubao') {
            await synthesizeDoubao(text, { ...connection, settings, signal: controller.signal, onAudio: bytes => {
              if (!res.headersSent) begin()
              forward(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: bytes.toString('base64') } } }] })}\n\n`)
            } })
            forward('data: [DONE]\n\n')
          } else {
            const upstream = await streamXiaomi(settings, text, controller.signal)
            begin()
            const reader = upstream.body!.getReader()
            try {
              while (!controller.signal.aborted) {
                const chunk = await reader.read()
                if (chunk.done) break
                forward(chunk.value)
              }
            } finally { if (!controller.signal.aborted) controller.abort(); reader.releaseLock() }
          }
          if (!res.destroyed) res.end()
        } else {
          const format = body.format === 'mp3' || body.format === 'wav' ? body.format : completeAudioFormat(settings)
          const audio = await synthesizeCompleteAudio(settings, text, format, controller, runtime)
          res.setHeader('content-type', format === 'wav' ? 'audio/wav' : 'audio/mpeg')
          res.setHeader('content-length', audio.length)
          res.setHeader('cache-control', 'no-store')
          res.end(audio)
        }
      } catch (error) {
        if (!disconnected) responseError(res, controller.signal.aborted && !(error instanceof CompleteAudioResponseError) ? new TtsProviderError('xiaomi-timeout', 'Synthesis timed out.', 504) : error, settings)
      } finally {
        clearTimeout(timeout)
        controller.abort()
        req.off('aborted', abort)
        res.off('close', abort)
      }
    },
  }), `xiaomi-mimo-tts: ${stream ? 'streaming ' : ''}synthesis route`)

  ctx.effect(() => {
    // Older DSH versions can keep using the HTTP Xiaomi routes.
    if (typeof ctx.webServer.registerUpgrade !== 'function') return () => {}
    const server = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false })
    const controllers = new Set<AbortController>()
    const remove = ctx.webServer.registerUpgrade({ path: TTS_DUPLEX_ROUTE, handler(req, socket, head) {
      let sameOrigin = false
      try { const origin = new URL(req.headers.origin ?? ''); sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host } catch { /* reject missing/malformed Origin */ }
      if (!sameOrigin) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
      server.handleUpgrade(req, socket, head, ws => {
        const controller = new AbortController()
        controllers.add(controller)
        let settings = resolveTtsSettings(current())
        let session: DoubaoSession | null = null
        let state: 'initial' | 'starting' | 'ready' | 'finishing' | 'ended' = 'initial'
        let closeTimer: ReturnType<typeof setTimeout> | undefined
        const initialTimer = setTimeout(() => fail(new TtsProviderError('tts-timeout', 'Start the synthesis session.', 504)), Math.min(10000, settings.requestTimeoutMs))
        const send = (value: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)) }
        const close = () => {
          clearTimeout(initialTimer)
          controller.abort()
          ws.close()
          closeTimer = setTimeout(() => ws.terminate(), 1000)
        }
        const fail = (error: unknown) => {
          if (state === 'ended') return
          state = 'ended'
          send({ type: 'error', provider: settings.provider, ...safeProviderError(error, [settings.apiKey, settings.doubaoApiKey]) })
          close()
        }
        ws.on('error', () => { controller.abort() })
        ws.on('close', () => { clearTimeout(initialTimer); clearTimeout(closeTimer); controller.abort(); controllers.delete(controller) })
        ws.on('message', (data, binary) => {
          if (state === 'ended') return
          try {
            if (binary) throw new TtsProviderError('invalid-request', 'Expected a JSON control message.', 400)
            const command = JSON.parse(data.toString()) as Record<string, unknown>
            if (command === null || typeof command !== 'object' || Array.isArray(command)) throw new TtsProviderError('invalid-request', 'Expected an object.', 400)
            if (command.type === 'cancel') { state = 'ended'; close(); return }
            if (command.type === 'start' && state === 'initial') {
              clearTimeout(initialTimer)
              settings = synthesisOptions(settings, command.selection as SynthesizeBody)
              if (settings.provider !== 'doubao') throw new TtsProviderError('streaming-model-unsupported', 'Duplex input requires Doubao.', 409)
              validateSynthesisSettings(settings)
              state = 'starting'
              session = new DoubaoSession({ ...connection, settings, signal: controller.signal, onAudio: bytes => {
                if (ws.readyState !== WebSocket.OPEN) throw new TtsProviderError('tts-canceled')
                if (ws.bufferedAmount + bytes.length > settings.maxPausedPcmBytes) throw new TtsProviderError('stream-buffer-limit')
                ws.send(bytes)
              } })
              void session.ready.then(() => {
                if (state !== 'starting') return
                state = 'ready'
                send({ type: 'ready', format: 'pcm', sampleFormat: 's16le', sampleRate: 24000, channels: 1 })
              }).catch(fail)
              void session.done.then(() => { if (state !== 'ended') { state = 'ended'; send({ type: 'done' }); close() } }).catch(fail)
            } else if (command.type === 'text' && state === 'ready' && typeof command.text === 'string') {
              const text = prepareTtsText(command.text)
              if (text) session!.append(text)
            } else if (command.type === 'finish' && state === 'ready') {
              state = 'finishing'
              void session!.finish().catch(fail)
            } else throw new TtsProviderError('invalid-session-state', 'Invalid synthesis message order.', 400)
          } catch (error) { fail(error instanceof TtsProviderError ? error : new TtsProviderError('invalid-request', 'Invalid synthesis command.', 400)) }
        })
      })
    } })
    return () => {
      remove()
      for (const controller of controllers) controller.abort()
      for (const client of server.clients) client.terminate()
      server.close()
    }
  }, 'xiaomi-mimo-tts: duplex synthesis route')
}
