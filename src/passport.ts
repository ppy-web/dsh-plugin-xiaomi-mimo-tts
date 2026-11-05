import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { PassportBridge } from './passport/bridge.js'
import { PassportSession } from './passport/session.js'
import { DEFAULT_PASSPORT_SETTINGS as defaults, isPassportAccessToken, PASSPORT_STATUS_ROUTE, PASSPORT_PRESETS_ROUTE } from './types/passport.js'
import type { PassportSettings } from './types/passport.js'
import { json } from './host/http.js'
import { passportAddresses } from './passport/network.js'

export { PassportBridge } from './passport/bridge.js'
export type { PassportOptions, PassportSessionPort } from './passport/bridge.js'
export { PassportSession, PassportSessionStore } from './passport/session.js'
export { pcmWave, playbackPcm, PcmUtterances } from './passport/audio.js'

export const name = 'speech-delivery-passport'
// Keep the configuration owner alive before ASR or the conversation services are ready.
export const inject: string[] = []
const messages = (language: string) => JSON.parse(readFileSync(new URL(`./locale/passport/${language}.json`, import.meta.resolve('dsh-xiaomi-tts/package.json')), 'utf8')).config
export const Config = z.object({
  host: z.string().default(defaults.host).volatile(),
  port: z.number().step(1).min(1).max(65535).default(defaults.port).volatile(),
  accessToken: z.string().max(192).pattern(/^\S*$/u).role('secret').default(defaults.accessToken).volatile(),
  deviceId: z.string().default(defaults.deviceId).volatile(),
  agentPreset: z.string().default(defaults.agentPreset).volatile(),
  sessionRevision: z.string().max(128).default(defaults.sessionRevision).volatile(),
  cwd: z.string().default(defaults.cwd).volatile(),
  silenceMs: z.number().step(20).min(200).max(3000).default(defaults.silenceMs).volatile(),
  minSpeechMs: z.number().step(20).min(100).max(1000).default(defaults.minSpeechMs).volatile(),
  speechThreshold: z.number().min(0.001).max(0.5).default(defaults.speechThreshold).volatile(),
  maxRecordingSeconds: z.number().min(1).max(60).default(defaults.maxRecordingSeconds).volatile(),
  maxReplySeconds: z.number().min(1).max(120).default(defaults.maxReplySeconds).volatile(),
  requestTimeoutMs: z.number().min(10000).max(600000).default(defaults.requestTimeoutMs).volatile(),
}).i18n({ zh: messages('zh'), en: messages('en') })
export type Config = ReturnType<typeof Config>

/** Optional Host-only transport. No client or provider-specific registration is required. */
export function apply(ctx: Context, config: Config): void {
  let connection: PassportBridge | undefined
  let lastError: string | undefined
  let sessionError: string | undefined
  ctx.inject(['webServer'], child => {
    child.effect(() => child.webServer.register({ kind: 'exact', path: PASSPORT_PRESETS_ROUTE, async handler(req, res) {
      if (req.method !== 'GET') { res.setHeader('allow', 'GET'); json(res, 405, { error: 'method-not-allowed' }); return }
      try {
        const registry = ctx.get('agentPresets')
        if (!registry) { json(res, 503, { error: 'passport-preset-unavailable' }); return }
        const presets = (await registry.list()).map(({ id, name, broken }) => ({ id, name, unavailable: !!broken }))
        json(res, 200, { presets })
      } catch { json(res, 503, { error: 'passport-preset-unavailable' }) }
    } }))
    child.effect(() => child.webServer.register({ kind: 'exact', path: PASSPORT_STATUS_ROUTE, handler(req, res) {
      if (req.method !== 'GET') { res.setHeader('allow', 'GET'); json(res, 405, { error: 'method-not-allowed' }); return }
      const servicesReady = ['speechSynthesis', 'speechToText', 'agents', 'agentPresets', 'agentDefaultModel'].every(name => !!ctx.get(name))
      let recognitionReady = false
      try {
        const snapshot = ctx.get('speechToText')?.snapshot()
        recognitionReady = !!snapshot?.providers.some(provider => provider.id === snapshot.selection.providerId && ['ready', 'standby'].includes(provider.preparation.phase))
      } catch {}
      json(res, 200, { configured: isPassportAccessToken(config.accessToken.get()),
        listening: connection?.status.listening ?? false, connected: connection?.status.connected ?? false,
        servicesReady, recognitionReady, host: config.host.get(), port: config.port.get(), addresses: passportAddresses(), error: lastError,
        sessionError: connection?.status.connected ? undefined : sessionError })
    } }))
  })
  ctx.inject(['speechSynthesis', 'speechToText', 'agents', 'agentPresets', 'agentDefaultModel'], child => {
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
        const session = new PassportSession(child, settings.agentPreset, settings.cwd, undefined, settings.sessionRevision)
        const bridge = new PassportBridge(settings, session, child.speechToText, child.speechSynthesis,
          code => { sessionError = code; child.logger.warn(`Passport: ${code}`) },
          agent => child.emit('speech/delivered', { agent, automatic: true, result: { adapter: 'passport' } }))
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
    update()
  })
}
