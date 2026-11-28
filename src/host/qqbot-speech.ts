import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { AgentToolRegistry } from '@deepseek-ai/dsh-tools/pipeline'
import type { SpeechDeliveryResult, SpeechRequest } from '../host-api.js'
import { observeSpeech, qqSpeechPolicy, registerSpeak, speechOwner } from '../speech-agent.js'
import { abortable } from './abortable.js'
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
  const session = observeSpeech(ctx, qqSpeechPolicy(ctx, true), { accepts: (agent, source) => agent.session === source, global: true })
  const available = (agent: Agent) => session.admitted(agent) && speech.hasDelivery('qqbot') && !!ctx.tools.get(QQBOT_FILE_TOOL, agent)
  const lifecycle = new AbortController()
  ctx.effect(() => () => lifecycle.abort())
  const reasonForUnavailable = (agent: Agent): string => {
    if (!speech.hasDelivery('qqbot')) return 'delivery-unavailable'
    if (!ctx.tools.get(QQBOT_FILE_TOOL, agent)) return 'send-tool-unavailable'
    if (!input.get(agent)?.candidate) return 'no-qq-input'
    return 'not-admitted'
  }
  const say = async (agent: Agent, request: SpeechRequest): Promise<SpeechDeliveryResult> => {
    if (!available(agent)) {
      const checkSignal = request.signal ? AbortSignal.any([request.signal, lifecycle.signal]) : lifecycle.signal
      await admit(agent, checkSignal)
    }
    if (!available(agent)) {
      ctx.logger.warn(`QQ voice unavailable for agent=${agent.id}: reason=${reasonForUnavailable(agent)}`)
      throw new TtsProviderError('qqbot-voice-unavailable', 'This turn has no QQ voice delivery route.', 409)
    }
    return session.say(agent, request)
  }
  ctx.provide('qqbotSpeech', { admitted: (agent, turn) => session.admitted(agent, turn), say })

  const recordInput = (agent: Agent, turn: number, message: { source: { kind: string } }): boolean => {
    const existing = input.get(agent)
    if (agent.session.header.origin === 'subagent' || (existing?.turn ?? -1) > turn) return false
    const source = message.source
    const isRpcUser = (source.kind === 'user' || source.kind === 'retry') && 'rpcId' in source
    const isPlainQqUser = source.kind === 'user' && !('rpcId' in source)
    if (existing?.turn === turn) {
      if (isRpcUser) {
        existing.candidate = false
        delete existing.pending
        session.revoke(agent, turn)
      } else if (isPlainQqUser && !existing.candidate) {
        existing.candidate = true
        delete existing.pending
      }
      return existing.candidate
    }
    // QQBot 0.5.x submits a plain user message; the DSH Web/API prompt carries rpcId.
    input.set(agent, { turn, candidate: isPlainQqUser })
    return isPlainQqUser
  }

  const speakRegistry = !ctx.tools.get('speak') ? new AgentToolRegistry() : undefined
  if (speakRegistry) {
    registerSpeak(ctx, (request, exec) => say(speechOwner(exec), request), true, speakRegistry)
    ctx.tools.include(speakRegistry)
  }
  const syncSpeak = (agent: Agent): void => {
    speakRegistry?.set(agent, available(agent) ? ['speak'] : [])
  }

  // Remember claimed inputs in this turn before the loop resolves its tool set.
  // A QQ steer arriving mid-turn during a desktop-started turn switches ownership
  // to QQ (matching QQBot's TurnTracker); a desktop prompt with rpcId revokes QQ.
  ctx.on('agent/inbox/claimed', ({ agent, turn, message }) => {
    const candidate = recordInput(agent, turn, message)
    syncSpeak(agent)
    if (candidate && !session.admitted(agent)) {
      void admit(agent, lifecycle.signal)
    }
  }, { global: true })
  ctx.on('session/event', (source, event) => {
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return
    const agent = ctx.agents.get(source.id)
    if (!agent || agent.session !== source) return
    const claimed = input.get(agent)
    if (claimed && (claimed.turn < event.data.turn || (event.type === 'turn/end' && claimed.turn === event.data.turn))) {
      input.delete(agent)
      syncSpeak(agent)
    }
  }, { global: true })
  ctx.on('agent/disposed', ({ agent }) => { input.delete(agent) })
  async function admit(agent: Agent, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    if (available(agent)) {
      syncSpeak(agent)
      return true
    }
    const candidate = input.get(agent)
    if (!candidate?.candidate) return false
    const delivery = speech.conversationDelivery?.('qqbot')
    if (!delivery) {
      ctx.logger.debug(`QQ speech route skipped for agent=${agent.id}: delivery unavailable`)
      return false
    }
    const routeSignal = lifecycle.signal
    let check = candidate.pending
    if (!check) {
      let passed = false
      const pendingCheck = (async () => {
        if (!await delivery.policy.supports(agent, routeSignal)) {
          ctx.logger.debug(`QQ speech route skipped for agent=${agent.id}: policy unsupported`)
          return false
        }
        const route = await identity.inspect(agent.id, routeSignal)
        if (route.kind !== 'qqbot') {
          ctx.logger.debug(`QQ speech route skipped for agent=${agent.id}: identity=${route.kind}`)
          return false
        }
        routeSignal.throwIfAborted()
        if (input.get(agent) !== candidate || !candidate.candidate) return false
        const admitted = session.admit(agent, candidate.turn, async admitSignal => {
          const current = await identity.inspect(agent.id, admitSignal)
          if (ctx.agents.get(agent.id) !== agent || current.kind !== 'qqbot' || current.identity.key !== route.identity.key) {
            throw new TtsProviderError('qqbot-identity-unavailable')
          }
        })
        if (!admitted) ctx.logger.debug(`QQ speech route skipped for agent=${agent.id}: session turn=${candidate.turn} not active`)
        passed = admitted
        if (admitted) syncSpeak(agent)
        return admitted
      })().catch((error: unknown) => {
        if (routeSignal.aborted) return false
        ctx.logger.warn(`QQ speech route check failed for agent=${agent.id}`, error)
        return false
      }).finally(() => {
        if (!passed && candidate.pending === pendingCheck) delete candidate.pending
      })
      candidate.pending = check = pendingCheck
    }
    const admitted = await abortable(check, signal)
    syncSpeak(agent)
    return admitted
  }
  ctx.on('agent/pre-step', async ({ agent, signal, turn, messages }, next) => {
    for (const message of messages) recordInput(agent, turn, message)
    if (input.get(agent)?.turn === turn) await admit(agent, signal)
    else syncSpeak(agent)
    return next()
  }, { global: true })
  // Preset tools shadow the fallback. Host tool restrictions still apply.
  ctx.inject(['systemPrompt'], child => {
    child.systemPrompt.context({
      name: 'xiaomi:qqbot-speech', order: 310, required: true, interpolate: false,
      text: ({ agent, toolStep }) => {
        if (!agent || !available(agent)) return ''
        const automatic = speech.isAutomaticDeliveryEnabled('qqbot')
        const speak = toolStep !== undefined && toolStep.agent === agent
          ? toolStep.declarations.find(tool => tool.name === 'speak')
          : ctx.tools.get('speak', agent)
        return (automatic ? 'QQ 会自动朗读本轮的最终回复。普通聊天直接输出正文。' : '')
          + (speak ? '用户要求语音时直接调用 speak，把完整语音正文放在 text，不要先发文字铺垫。自动朗读开启时，用户明确指定语气、情绪或方言也可调用 speak，并传入 speechInstruction。语音送达后本轮会结束；只有用户同时要求文字时才设 replyWithText: true，接着发所需正文。' : '')
      },
    })
  })
}
