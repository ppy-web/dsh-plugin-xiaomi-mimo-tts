import type { Context } from '@deepseek-ai/cordis'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import type { SpeechDeliveryAdapter } from './host-api.js'
import { cleanupSpeechArtifacts, writeSpeechArtifact } from './host/speech-files.js'
import { TtsProviderError } from './host/provider-error.js'
import { buildQqbotPersona, cleanupQqbotMemes, loadWhaleMemes, QQBOT_MEDIA_ROOT, sendQqbotFile } from './host/qqbot-media.js'

export const name = 'speech-delivery-qqbot'
export const inject = ['speechSynthesis', 'tools', 'agentPresets']

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
  ctx.plugin(AgentPreset, {
    id: 'qq-speech-assistant',
    name: 'QQ 鲸鱼娘',
    description: '机灵嘴硬、温柔可靠的鲸鱼娘，用自然短句聊天，支持语音和本地表情包。',
    order: 42,
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: buildQqbotPersona(), complete: true, includeRuntimeContext: true } },
      { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
      { id: 'speech-agent', name: 'dsh-xiaomi-tts/speech-agent', config: { delivery: 'qqbot' } },
      { id: 'whale-memes', name: 'dsh-xiaomi-tts/qqbot-agent' },
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
