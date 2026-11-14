import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SpeechDeliveryResult, SpeechRequest } from '../host-api.js'
import { observeSpeech, qqSpeechPolicy, registerSpeak, speechOwner, speechRequest } from '../speech-agent.js'
import type { QqIdentityReader } from './qqbot-identity.js'
import { QQBOT_FILE_TOOL } from './qqbot-delivery-signal.js'
import { TtsProviderError } from './provider-error.js'

interface QqbotSpeech {
  admitted(agent: Agent, turn?: number): boolean
  say(agent: Agent, request: SpeechRequest): Promise<SpeechDeliveryResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context { qqbotSpeech: QqbotSpeech }
}

export const QQ_PRESET_ID = 'qq-speech-assistant'

export function registerQqbotSpeech(ctx: Context, identity: QqIdentityReader): void {
  const speech = ctx.speechSynthesis
  const input = new WeakMap<Agent, { turn: number; candidate: boolean; pending?: Promise<boolean> }>()
  const session = observeSpeech(ctx, qqSpeechPolicy(ctx, true), { accepts: (agent, source) => agent.session === source })
  const available = (agent: Agent) => session.admitted(agent) && speech.hasDelivery('qqbot') && !!ctx.tools.get(QQBOT_FILE_TOOL, agent)
  const say = async (agent: Agent, request: SpeechRequest): Promise<SpeechDeliveryResult> => {
    if (!available(agent)) throw new TtsProviderError('qqbot-voice-unavailable', 'This turn has no QQ voice delivery route.', 409)
    return session.say(agent, request)
  }
  ctx.provide('qqbotSpeech', { admitted: (agent, turn) => session.admitted(agent, turn), say })

  // Remember the first claimed input before the loop resolves its tool set.
  ctx.on('agent/inbox/claimed', ({ agent, turn, message }) => {
    const existing = input.get(agent)
    if (agent.session.header.origin === 'subagent' || (existing?.turn ?? -1) > turn) return
    const source = message.source
    if ((source.kind === 'user' || source.kind === 'retry') && 'rpcId' in source && existing?.turn === turn) {
      existing.candidate = false
      session.revoke(agent, turn)
      return
    }
    if (existing?.turn === turn) return
    // QQBot 0.5.x submits a plain user message; the DSH Web/API prompt carries rpcId.
    input.set(agent, { turn, candidate: source.kind === 'user' && !('rpcId' in source) })
  })
  ctx.on('session/event', (source, event) => {
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return
    const agent = ctx.agents.get(source.id)
    if (!agent || agent.session !== source) return
    const claimed = input.get(agent)
    if (claimed && (claimed.turn < event.data.turn || (event.type === 'turn/end' && claimed.turn === event.data.turn))) input.delete(agent)
  })
  ctx.on('agent/disposed', ({ agent }) => { input.delete(agent) })
  async function admit(agent: Agent, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    if (available(agent)) return true
    const candidate = input.get(agent)
    if (!candidate?.candidate) return false
    const delivery = speech.conversationDelivery?.('qqbot')
    if (!delivery) return false
    return candidate.pending ??= (async () => {
      if (!await delivery.policy.supports(agent, signal)) return false
      const route = await identity.inspect(agent.id, signal)
      if (route.kind !== 'qqbot') return false
      signal.throwIfAborted()
      if (input.get(agent) !== candidate || !candidate.candidate) return false
      return session.admit(agent, candidate.turn, async signal => {
        const current = await identity.inspect(agent.id, signal)
        if (ctx.agents.get(agent.id) !== agent || current.kind !== 'qqbot' || current.identity.key !== route.identity.key) {
          throw new TtsProviderError('qqbot-identity-unavailable')
        }
      })
    })().catch((error: unknown) => {
      signal.throwIfAborted()
      ctx.logger.warn(`QQ speech route check failed for agent=${agent.id}`, error)
      return false
    })
  }
  ctx.on('agent/pre-step', async ({ agent, signal, turn }, next) => {
    if (input.get(agent)?.turn === turn) await admit(agent, signal)
    return next()
  })
  // Preset tools shadow the fallback. Host tool restrictions still apply.
  if (!ctx.tools.get('speak')) registerSpeak(ctx, async (args, exec) => say(speechOwner(exec), speechRequest(args, exec.signal)), true,
    { when: ({ agent, signal }) => admit(agent, signal) })
  ctx.inject(['systemPrompt'], child => {
    child.systemPrompt.context({
      name: 'xiaomi:qqbot-speech', order: 310, required: true, interpolate: false,
      text: ({ agent, toolSet }) => {
        if (!agent || !available(agent)) return ''
        const automatic = speech.isAutomaticDeliveryEnabled('qqbot')
        const speak = ctx.tools.get('speak', agent, toolSet)
        return (automatic ? 'QQ 会自动朗读本轮的最终回复。普通聊天直接输出正文。' : '')
          + (speak ? '用户要求语音时调用 speak。自动朗读开启时，用户明确指定语气、情绪或方言也可调用 speak，并传入 speechInstruction。语音成功后，用户同时要求文字时才补正文。' : '')
      },
    })
  })
}
