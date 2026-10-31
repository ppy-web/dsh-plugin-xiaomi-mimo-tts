import type { Context } from '@deepseek-ai/cordis'
import type { SpeechDeliveryAdapter } from './host-api.js'
import { cleanupSpeechArtifacts, writeSpeechArtifact } from './host/speech-files.js'
import { TtsProviderError } from './host/provider-error.js'
import { cleanupQqbotMemes, loadWhaleMemes, QQBOT_MEDIA_ROOT, sendQqbotFile } from './host/qqbot-media.js'

export { QqCompanion } from './host/qqbot-companion.js'
export { QqMemoryStore, parseQqIdentity } from './host/qqbot-memory.js'
export { QqIdentityReader } from './host/qqbot-identity.js'
export { DEFAULT_WHALE_PERSONA } from './types/whale.js'

export const name = 'speech-delivery-qqbot'
export const inject = ['speechSynthesis', 'tools']

/** Reuse qqbot's registered tool and its routing, whitelist and reply limiter. */
export function createQqbotSpeechDelivery(ctx: Context, directory = QQBOT_MEDIA_ROOT): SpeechDeliveryAdapter {
  return {
    id: 'qqbot', format: 'silk',
    check({ agent, signal }) {
      signal.throwIfAborted()
      if (!ctx.tools.executable('qqbot_send_file', agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending speech.', 409)
    },
    async send(audio, { agent, signal }) {
      signal.throwIfAborted()
      if (!ctx.tools.executable('qqbot_send_file', agent)) throw new TtsProviderError('qqbot-send-tool-unavailable', 'Enable QQBot before sending speech.', 409)
      const artifact = await writeSpeechArtifact(audio, directory)
      try {
        signal.throwIfAborted()
        return await sendQqbotFile(ctx, artifact.path, { agent, signal })
      } finally { await artifact.remove().catch(() => { ctx.logger.warn('QQ speech artifact cleanup failed.') }) }
    },
  }
}

export function apply(ctx: Context): void {
  ctx.provide('qqbotMemes', loadWhaleMemes())
  ctx.effect(() => ctx.speechSynthesis.registerDelivery(createQqbotSpeechDelivery(ctx)))
  ctx.effect(() => {
    const clean = () => Promise.all([cleanupSpeechArtifacts(QQBOT_MEDIA_ROOT), cleanupQqbotMemes()])
      .catch(() => { ctx.logger.warn('QQ media cleanup failed.') })
    void clean()
    const timer = setInterval(() => { void clean() }, 60 * 60 * 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
}
