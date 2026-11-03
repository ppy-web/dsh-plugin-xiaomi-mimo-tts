import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import z from '@deepseek-ai/schemastery'
import { PassportBridge } from './passport/bridge.js'
import { PassportSession } from './passport/session.js'

export { PassportBridge } from './passport/bridge.js'
export type { PassportOptions, PassportSessionPort } from './passport/bridge.js'
export { PassportSession, PassportSessionStore } from './passport/session.js'
export { pcmWave, playbackPcm, PcmUtterances } from './passport/audio.js'

export const name = 'speech-delivery-passport'
export const inject = ['speechSynthesis', 'speechToText', 'agents', 'agentPresets', 'agentDefaultModel']
export const Config = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().step(1).min(1).max(65535).default(3101),
  accessToken: z.string().role('secret').default(''),
  deviceId: z.string().default(''),
  agentPreset: z.string().default(''),
  cwd: z.string().default(''),
  silenceMs: z.number().step(20).min(200).max(3000).default(700),
  minSpeechMs: z.number().step(20).min(100).max(1000).default(200),
  speechThreshold: z.number().min(0.001).max(0.5).default(0.015),
  maxRecordingSeconds: z.number().min(1).max(60).default(30),
  maxReplySeconds: z.number().min(1).max(120).default(60),
  requestTimeoutMs: z.number().min(10000).max(600000).default(180000),
})
export type Config = ReturnType<typeof Config>

/** Optional Host-only transport. No client or provider-specific registration is required. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const session = new PassportSession(ctx, config.agentPreset, config.cwd)
  const bridge = new PassportBridge(config, session, ctx.speechToText, ctx.speechSynthesis,
    code => ctx.logger.warn(`Passport: ${code}`),
    agent => ctx.emit('speech/delivered', { agent, automatic: true, result: { adapter: 'passport' } }))
  ctx.effect(() => async () => {
    await Promise.all([session.dispose(), bridge.dispose()])
  })
  ctx.effect(() => ctx.speechSynthesis.registerDelivery(bridge.adapter))
  ctx.on('session/event', (source, event) => bridge.observe(source, event))
  await bridge.listen()
}
