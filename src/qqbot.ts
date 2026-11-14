import type { Context } from '@deepseek-ai/cordis'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type { ServerResponse } from 'node:http'
import { TTS_QQ_MEMORY_ROUTE } from './constants.js'
import { json, readJsonBody } from './host/http.js'
import { QqMemoryAdmin } from './host/qqbot-memory-admin.js'
import { QqMemoryStore } from './host/qqbot-memory.js'
import { QqIdentityReader, qqCompanionNamespace } from './host/qqbot-identity.js'
import { createQqCompanion } from './host/qqbot-companion-host.js'
import { whaleConfigFields, readWhaleConfig } from './host/whale-config.js'
import type { WhaleConfig } from './host/whale-config.js'
import type { WhaleSettings } from './types/whale.js'
import type { SpeechDeliveryAdapter } from './host-api.js'
import { cleanupSpeechArtifacts, writeSpeechArtifact } from './host/speech-files.js'
import { TtsProviderError } from './host/provider-error.js'
import { cleanupQqbotMemes, loadWhaleMemes, QQBOT_MEDIA_ROOT, sendQqbotFile } from './host/qqbot-media.js'
import { QQ_PRESET_ID, registerQqbotSpeech } from './host/qqbot-speech.js'
import { QQBOT_FILE_TOOL } from './host/qqbot-delivery-signal.js'

export { QqCompanion } from './host/qqbot-companion.js'
export { QqMemoryStore, parseQqIdentity } from './host/qqbot-memory.js'
export { QqIdentityReader } from './host/qqbot-identity.js'
export { QqMemoryAdmin } from './host/qqbot-memory-admin.js'
export { DEFAULT_WHALE_PERSONA } from './types/whale.js'

export const name = 'speech-delivery-qqbot'
export const inject = ['speechSynthesis', 'tools', 'agentPresets']
export const Config: z<WhaleConfig> = z.object(whaleConfigFields('qqbot'))
export type Config = WhaleConfig

declare module '@deepseek-ai/cordis' {
  interface Context {
    qqbotSettings: { current(): WhaleSettings }
  }
}

/** Reuse qqbot's registered tool and its routing, whitelist and reply limiter. */
export function createQqbotSpeechDelivery(ctx: Context, directory = QQBOT_MEDIA_ROOT): SpeechDeliveryAdapter {
  return {
    id: 'qqbot', format: 'silk',
    conversation: {
      supports(agent, signal) {
        signal.throwIfAborted()
        return agent.session.header.origin !== 'subagent' && !!ctx.tools.get(QQBOT_FILE_TOOL, agent)
      },
      limits: () => ctx.get('qqbotSpeechRules')?.current() ?? { maxAutoCharacters: 0, maxDurationMs: 0 },
    },
    check({ agent, signal }) {
      signal.throwIfAborted()
      if (!ctx.tools.get(QQBOT_FILE_TOOL, agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending speech.', 409)
    },
    async send(audio, context) {
      const { agent, signal } = context
      signal.throwIfAborted()
      if (!ctx.tools.get(QQBOT_FILE_TOOL, agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending speech.', 409)
      const artifact = await writeSpeechArtifact(audio, directory)
      try {
        signal.throwIfAborted()
        return await sendQqbotFile(ctx, artifact.path, context)
      } finally { await artifact.remove().catch(() => { ctx.logger.warn('QQ speech artifact cleanup failed.') }) }
    },
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'speech-delivery-qqbot: custom settings page')
  })
  const current = () => readWhaleConfig(config)
  ctx.provide('qqbotSettings', { current })
  const companion = createQqCompanion(ctx, current)
  ctx.provide('qqbotCompanion', companion)
  ctx.effect(() => () => companion.dispose())
  const admin = new QqMemoryAdmin(new QqMemoryStore(qqCompanionNamespace(ctx, 'speech-delivery-qqbot')), new QqIdentityReader())
  ctx.provide('qqbotMemoryAdmin', admin)
  const webServer = ctx.get('webServer')
  if (webServer) ctx.effect(() => webServer.register({
    kind: 'exact', path: TTS_QQ_MEMORY_ROUTE,
    async handler(req, res: ServerResponse) {
      if (req.method === 'GET') { json(res, 200, { peers: await admin.list() }); return }
      if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); json(res, 405, { error: 'method-not-allowed' }); return }
      try {
        const body = await readJsonBody(req, 64 * 1024)
        json(res, 200, await admin.update(body as Parameters<typeof admin.update>[0]))
      } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : 'qqbot-memory-update-failed' }) }
    },
  }), 'dsh-xiaomi-tts: QQ memory route')
  ctx.provide('qqbotMemes', loadWhaleMemes())
  ctx.effect(() => ctx.speechSynthesis.registerDelivery(createQqbotSpeechDelivery(ctx)))
  ctx.inject(['agents'], child => { registerQqbotSpeech(child, companion.identity) })
  ctx.plugin(AgentPreset, {
    id: QQ_PRESET_ID, name: 'QQ 鲸鱼娘',
    description: '独立配置的 QQ 鲸鱼娘，支持自动语音、本地表情与隔离记忆。', order: 42,
    plugins: [
      { id: 'qq-persona', name: 'dsh-xiaomi-tts/qqbot-agent' },
      { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
      { id: 'speech-agent', name: 'dsh-xiaomi-tts/speech-agent', config: { delivery: 'qqbot' } },
    ],
  })
  ctx.effect(() => {
    const clean = () => Promise.all([cleanupSpeechArtifacts(QQBOT_MEDIA_ROOT), cleanupQqbotMemes()])
      .catch(() => { ctx.logger.warn('QQ media cleanup failed.') })
    void clean()
    const timer = setInterval(() => { void clean() }, 60 * 60 * 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
}
