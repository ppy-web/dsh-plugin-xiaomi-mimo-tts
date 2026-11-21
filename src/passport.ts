import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { PassportBridge } from './passport/bridge.js'
import { PassportSession } from './passport/session.js'
import { DEFAULT_PASSPORT_SETTINGS as defaults, isPassportAccessToken, PASSPORT_STATUS_ROUTE, PASSPORT_ASR_TEST_ROUTE, PASSPORT_ASR_PROVIDERS, PASSPORT_NUMBER_FIELDS, PASSPORT_PRESETS_ROUTE, PASSPORT_DEVICE_ASSET_ROUTE, PASSPORT_SCREEN_ASSET_ROUTE } from './types/passport.js'
import type { PassportSettings } from './types/passport.js'
import { json, readJsonBody, sameOriginRequest, isJsonContentType } from './host/http.js'
import { registerStaticAsset } from './host/assets.js'
import { PASSPORT_ASR_ERROR_CODES } from './passport/asr-error.js'
import { passportAddresses } from './passport/network.js'
import { hostRecognizer } from './passport/recognition.js'

export { PassportBridge } from './passport/bridge.js'
export type { PassportOptions, PassportSessionPort } from './passport/bridge.js'
export { PassportSession, PassportSessionStore } from './passport/session.js'
export { pcmWave, playbackPcm, PcmUtterances } from './passport/audio.js'
export { PassportRecognition, hostRecognizer } from './passport/recognition.js'

export const name = 'speech-delivery-passport'
// Keep the configuration owner alive before ASR or the conversation services are ready.
export const inject: string[] = []
const messages = (language: string) => JSON.parse(readFileSync(new URL(`./locale/passport/${language}.json`, import.meta.resolve('dsh-xiaomi-tts/package.json')), 'utf8')).config
const ranges = PASSPORT_NUMBER_FIELDS
export const Config = z.object({
  asrProvider: z.union(PASSPORT_ASR_PROVIDERS).default('host').volatile(),
  host: z.string().default(defaults.host).volatile(),
  port: z.number().step(ranges.port.step).min(ranges.port.min).max(ranges.port.max).default(defaults.port).volatile(),
  accessToken: z.string().max(192).pattern(/^\S*$/u).role('secret').default(defaults.accessToken).volatile(),
  deviceId: z.string().default(defaults.deviceId).volatile(),
  agentPreset: z.string().default(defaults.agentPreset).volatile(),
  sessionRevision: z.string().max(128).default(defaults.sessionRevision).volatile(),
  cwd: z.string().default(defaults.cwd).volatile(),
  silenceMs: z.number().step(ranges.silenceMs.step).min(ranges.silenceMs.min).max(ranges.silenceMs.max).default(defaults.silenceMs).volatile(),
  minSpeechMs: z.number().step(ranges.minSpeechMs.step).min(ranges.minSpeechMs.min).max(ranges.minSpeechMs.max).default(defaults.minSpeechMs).volatile(),
  speechThreshold: z.number().min(ranges.speechThreshold.min).max(ranges.speechThreshold.max).default(defaults.speechThreshold).volatile(),
  maxRecordingSeconds: z.number().min(ranges.maxRecordingSeconds.min).max(ranges.maxRecordingSeconds.max).default(defaults.maxRecordingSeconds).volatile(),
  maxReplySeconds: z.number().min(ranges.maxReplySeconds.min).max(ranges.maxReplySeconds.max).default(defaults.maxReplySeconds).volatile(),
  requestTimeoutMs: z.number().min(ranges.requestTimeoutMs.min).max(ranges.requestTimeoutMs.max).default(defaults.requestTimeoutMs).volatile(),
}).i18n({ zh: messages('zh'), en: messages('en') })
export type Config = ReturnType<typeof Config>

/** Optional Host-only transport. No client or provider-specific registration is required. */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'speech-delivery-passport: custom settings page')
  })
  let connection: PassportBridge | undefined
  let lastError: string | undefined
  let sessionError: string | undefined
  ctx.inject(['webServer'], child => {
    const asrTestControllers = new Set<AbortController>()
    let asrTestsClosed = false
    child.effect(() => () => {
      asrTestsClosed = true
      for (const controller of asrTestControllers) controller.abort()
      asrTestControllers.clear()
    }, 'speech-delivery-passport: cleanup ASR tests')
    child.effect(() => child.webServer.register({ kind: 'exact', path: PASSPORT_ASR_TEST_ROUTE, async handler(req, res) {
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); json(res, 405, { error: 'method-not-allowed' }); return }
      if (!sameOriginRequest(req, true)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      if (!isJsonContentType(req)) { json(res, 415, { error: 'invalid-content-type' }); return }
      let source: PassportSettings['asrProvider']
      try {
        const body = await readJsonBody(req, 1024) as Record<string, unknown>
        const selected = PASSPORT_ASR_PROVIDERS.find(provider => provider === body?.source)
        if (!selected || Object.keys(body).length !== 1) throw new Error('invalid')
        source = selected
      } catch { if (!res.destroyed) json(res, 400, { error: 'passport-asr-test-invalid' }); return }
      if (res.destroyed) return
      if (asrTestsClosed) { json(res, 503, { error: 'passport-asr-unavailable' }); return }
      if (asrTestControllers.size >= 4) { json(res, 429, { error: 'passport-asr-rate-limited' }); return }
      const controller = new AbortController()
      asrTestControllers.add(controller)
      const timer = setTimeout(() => controller.abort(), 15000)
      const close = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', close)
      let input: ReturnType<ReturnType<typeof hostRecognizer>['create']> | undefined
      try {
        const service = child.get('passportRecognition')
        if (source !== 'host' && !service) throw new Error('passport-asr-unavailable')
        const recognizer = service?.recognizer(source, child.get('speechToText')) ?? hostRecognizer(child.get('speechToText'))
        recognizer.check()
        input = recognizer.create(controller.signal, 32000)
        input.append(Buffer.alloc(32000))
        await Promise.race([
          input.finish(),
          new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('passport-asr-timeout')), { once: true })),
        ])
        controller.signal.throwIfAborted()
        json(res, 200, { ok: true })
      } catch (error) {
        if (res.destroyed) return
        const code = error instanceof Error ? error.message : ''
        if (code === 'passport-no-speech' && !controller.signal.aborted) json(res, 200, { ok: true })
        else {
          const details = error instanceof Error ? error as Error & { upstreamStatus?: unknown; upstreamCode?: unknown } : undefined
          json(res, 502, { error: controller.signal.aborted ? 'passport-asr-timeout' : PASSPORT_ASR_ERROR_CODES.has(code) ? code : error instanceof TypeError ? 'passport-asr-network-failed' : 'passport-recognition-failed',
            ...(typeof details?.upstreamStatus === 'number' && Number.isInteger(details.upstreamStatus) && details.upstreamStatus >= 100 && details.upstreamStatus <= 599 ? { upstreamStatus: details.upstreamStatus } : {}),
            ...(typeof details?.upstreamCode === 'number' && Number.isSafeInteger(details.upstreamCode) && details.upstreamCode >= 0 && details.upstreamCode <= 0xffffffff ? { upstreamCode: details.upstreamCode } : {}) })
        }
      } finally { clearTimeout(timer); res.off('close', close); asrTestControllers.delete(controller); input?.cancel() }
    } }))
    child.effect(() => child.webServer.register({ kind: 'exact', path: PASSPORT_PRESETS_ROUTE, async handler(req, res) {
      if (req.method !== 'GET') { res.setHeader('allow', 'GET'); json(res, 405, { error: 'method-not-allowed' }); return }
      if (!sameOriginRequest(req)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      try {
        const registry = ctx.get('agentPresets')
        if (!registry) { json(res, 503, { error: 'passport-preset-unavailable' }); return }
        const presets = (await registry.list()).map(({ id, name, broken }) => ({ id, name, unavailable: !!broken }))
        json(res, 200, { presets })
      } catch { json(res, 503, { error: 'passport-preset-unavailable' }) }
    } }))
    for (const [path, filename] of [[PASSPORT_DEVICE_ASSET_ROUTE, 'passport-device.webp'], [PASSPORT_SCREEN_ASSET_ROUTE, 'passport-screen.webp']] as const) {
      registerStaticAsset(child, {
        path,
        data: readFileSync(new URL(`../assets/ui/${filename}`, import.meta.url)),
        contentType: 'image/webp',
        description: `passport asset ${filename}`,
      })
    }
    child.effect(() => child.webServer.register({ kind: 'exact', path: PASSPORT_STATUS_ROUTE, handler(req, res) {
      if (req.method !== 'GET') { res.setHeader('allow', 'GET'); json(res, 405, { error: 'method-not-allowed' }); return }
      if (!sameOriginRequest(req)) { json(res, 403, { error: 'cross-origin-denied' }); return }
      res.setHeader('cache-control', 'no-store')
      const asrProvider = config.asrProvider.get()
      const servicesReady = ['speechSynthesis', 'agents', 'agentPresets', 'agentDefaultModel', ...(asrProvider === 'host' ? ['speechToText'] : ['passportRecognition'])].every(name => !!ctx.get(name))
      let recognitionReady = false
      try {
        if (asrProvider !== 'host' && !ctx.get('passportRecognition')) throw new Error('passport-asr-unavailable')
        const recognizer = ctx.get('passportRecognition')?.recognizer(asrProvider, ctx.get('speechToText')) ?? hostRecognizer(ctx.get('speechToText'))
        recognizer.check(); recognitionReady = true
      } catch {}
      json(res, 200, { configured: isPassportAccessToken(config.accessToken.get()),
        listening: connection?.status.listening ?? false, connected: connection?.status.connected ?? false, activity: connection?.status.activity,
        servicesReady, recognitionReady, asrProvider,
        recognitionChoices: ctx.get('passportRecognition')?.choices().map(choice => choice.id === 'host' ? { ...choice, configured: !!ctx.get('speechToText') } : choice),
        host: config.host.get(), port: config.port.get(), addresses: passportAddresses(), error: lastError,
        sessionError: connection?.status.connected ? undefined : sessionError })
    } }))
  })
  ctx.inject(['speechSynthesis', 'agents', 'agentPresets', 'agentDefaultModel'], child => {
    let current: { bridge: PassportBridge; stop(): Promise<void> } | undefined
    let pending = Promise.resolve()
    let generation = 0
    let disposed = false
    const update = (): void => {
      const requested = ++generation
      pending = pending.then(async () => {
        if (disposed || requested !== generation) return
        const previous = current
        current = undefined
        connection = undefined
        lastError = undefined
        await previous?.stop()
        if (disposed || requested !== generation) return
        sessionError = undefined
        const settings = Object.fromEntries(Object.keys(defaults).map(key => [key, config[key]!.get()])) as unknown as PassportSettings
        // An unconfigured component still owns editable settings, but exposes no network listener.
        if (!isPassportAccessToken(settings.accessToken)) return
        if (settings.asrProvider === 'host' && !child.get('speechToText')) return
        if (settings.asrProvider !== 'host' && !child.get('passportRecognition')) return
        const recognition = child.get('passportRecognition')?.recognizer(settings.asrProvider, child.get('speechToText')) ?? hostRecognizer(child.get('speechToText'))
        const session = new PassportSession(child, settings.agentPreset, settings.cwd, undefined, settings.sessionRevision)
        const bridge = new PassportBridge(settings, session, recognition, child.speechSynthesis,
          code => { sessionError = code; child.logger.warn(`Passport: ${code}`) },
          agent => child.emit('speech/delivered', { agent, automatic: true, result: { adapter: 'passport' } }),
          (turnId, stage, elapsedMs) => child.logger.info(`Passport timing turn=${turnId} source=${settings.asrProvider} stage=${stage} elapsed_ms=${elapsedMs}`))
        let unregister = () => {}
        const stop = async (): Promise<void> => {
          unregister()
          await Promise.all([session.dispose(), bridge.dispose()])
        }
        try {
          await bridge.listen()
          if (disposed || requested !== generation) { await stop(); return }
          unregister = child.speechSynthesis.registerDelivery(bridge.adapter)
          current = { bridge, stop }
          connection = bridge
        } catch (error) {
          await stop()
          const code = (error as NodeJS.ErrnoException).code
          lastError = code === 'EADDRINUSE' ? 'passport-port-in-use' : code === 'EADDRNOTAVAIL' ? 'passport-listen-address-unavailable' : 'passport-server-unavailable'
          child.logger.warn(`Passport: ${lastError}`)
        }
      }).catch(() => child.logger.warn('Passport: passport-reconfigure-failed'))
    }
    child.effect(() => async () => {
      disposed = true
      generation++
      await pending
      await current?.stop()
      current = undefined
      connection = undefined
    })
    child.effect(() => ctx.on('loader/volatile-update', update))
    child.on('session/event', (source, event) => current?.bridge.observe(source, event))
    child.inject(['speechToText'], recognitionCtx => {
      if (config.asrProvider.get() === 'host') update()
      recognitionCtx.effect(() => () => { if (config.asrProvider.get() === 'host') update() })
    })
    child.inject(['passportRecognition'], recognitionCtx => {
      if (config.asrProvider.get() !== 'host') update()
      recognitionCtx.effect(() => () => { if (config.asrProvider.get() !== 'host') update() })
    })
    update()
  })
}
