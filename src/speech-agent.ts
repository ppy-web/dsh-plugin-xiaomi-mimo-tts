import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRegistrationOptions, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import z from '@deepseek-ai/schemastery'
import type { SpeechDeliveryResult, SpeechRequest } from './host-api.js'
import { BREEZE_AUDIO_TAG_GUIDANCE, XIAOMI_AUDIO_TAG_GUIDANCE } from './shared.js'
import { SessionSpeech, type SessionSpeechOptions } from './host/session-speech.js'
import { SpeechModeStore } from './host/speech-mode-store.js'
import { TtsProviderError } from './host/provider-error.js'
import type {} from './host/speech-service.js'
import type {} from './host/qqbot-speech.js'

export const name = 'speech-agent'
export const inject = ['speechSynthesis', 'tools', 'agents']
export const Config = z.object({
  delivery: z.string().default('file'),
  defaultMode: z.union(['manual', 'auto']).default('manual'),
  maxAutoCharacters: z.number().step(1).min(0).default(300),
  maxDurationMs: z.number().step(1).min(0).default(60000),
})
export type Config = ReturnType<typeof Config>

export function speechOwner(exec: ToolRunContext): Agent {
  if (!exec.agent) throw new TtsProviderError('speech-agent-required', 'Use this tool inside an agent conversation.', 400)
  return exec.agent
}

const selection = {
  text: { type: 'string', description: 'Text to read. Preserve the requested content; do not add narration.' },
  provider: { type: 'string', enum: ['xiaomi', 'doubao', 'breeze'], description: 'Omit to use the saved Host provider. After a synthesis failure, retry once with another configured provider (xiaomi, doubao or breeze); its saved model, voice and credentials apply.' },
  model: { type: 'string' },
  voice: { type: 'string' },
  speechInstruction: { type: 'string', description: 'Optional natural-language emotion, tone, dialect or delivery style for this call, written in the language of the text. Saved voice and model stay unchanged.' },
  voiceDesignPrompt: { type: 'string' },
  voiceRate: { type: 'number', minimum: 0.5, maximum: 2 },
} as const

const EXTERNAL_SPEECH_GUIDANCE = ' When an external speech plugin has taken over, omit provider, model, voice, voiceDesignPrompt, speechInstruction and voiceRate to use its configured voice. Only pass model, voice, speechInstruction or audio tags when the external engine advertises support for those options. External engines do not accept voiceDesignPrompt or voiceRate overrides. Use WAV when the engine does not advertise MP3 support.'

interface SpeakOptions { replyWithText?: boolean }

export function speechRequest(args: unknown, signal: AbortSignal): SpeechRequest {
  if (!args || typeof args !== 'object' || typeof (args as SpeechRequest).text !== 'string') throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
  const { replyWithText: _, ...request } = args as SpeechRequest & SpeakOptions
  return { ...request, signal }
}

export function observeSpeech(ctx: Context, policy: SessionSpeechOptions, options: {
  accepts?: (agent: Agent, session: Session) => boolean
  suppressAutomatic?: (agent: Agent, turn: number) => boolean
} = {}): SessionSpeech {
  const { delivery } = policy
  const sessionSpeech = new SessionSpeech(ctx.speechSynthesis, new SpeechModeStore(), policy,
    (agent, result, automatic) => { ctx.emit('speech/delivered', { agent, result, automatic }) },
    (code, agent, automatic) => {
      ctx.logger.warn(`Speech integration: ${code} agent=${agent.id} delivery=${delivery} automatic=${automatic}`)
      ctx.emit('speech/failed', { agent, adapter: delivery, code, automatic })
    },
  )
  ctx.effect(() => () => sessionSpeech.dispose())
  ctx.on('session/event', (session, event) => {
    const agent = ctx.agents.get(session.id)
    if (!agent || options.accepts?.(agent, session) === false) return
    const suppress = event.type === 'turn/end' && options.suppressAutomatic?.(agent, event.data.turn) === true
    sessionSpeech.observe(agent, event, suppress)
  })
  ctx.on('agent/disposed', ({ agent }) => { sessionSpeech.release(agent) })
  return sessionSpeech
}

export function qqSpeechPolicy(ctx: Context, turnScoped = false): SessionSpeechOptions {
  const limits = () => ctx.speechSynthesis.conversationDelivery?.('qqbot')?.policy.limits() ?? ctx.get('qqbotSpeechRules')?.current()
  return {
    delivery: 'qqbot', defaultMode: 'manual', sourceControlled: true, turnScoped,
    get maxAutoCharacters() { return limits()?.maxAutoCharacters ?? 0 },
    get maxDurationMs() { return limits()?.maxDurationMs ?? 0 },
  }
}

export function registerSpeak(ctx: Context, send: (request: SpeechRequest, exec: ToolRunContext) => Promise<SpeechDeliveryResult>, qq: boolean, options?: ToolRegistrationOptions): void {
  const properties = qq ? { text: selection.text, provider: selection.provider, speechInstruction: selection.speechInstruction } : selection
  const replyWithText = {
    type: 'boolean',
    description: 'QQ only. Set true only if the user also requests a written reply. After the audio, send the requested text without a delivery notice. Otherwise omit this option and let the voice reply end the turn.',
  } as const
  ctx.tools.register({
    name: 'speak',
    description: 'Read the requested text and deliver audio through this conversation\'s configured speech adapter. Use when asked to answer by voice or read a passage. A successful call already delivered the audio: do not send the file again. When the user explicitly requests an emotion, tone, dialect or delivery style, pass speechInstruction in the same language as the text and keep the saved voice and model. Use provider-specific audio tags only for Breeze or Xiaomi preset voices; use speechInstruction for Doubao and Xiaomi VoiceDesign.'
      + (qq
        ? ' QQ replies use the saved Host provider by default. speechInstruction is allowed for the user\'s requested style and applies only to this call; the saved model, voice and credentials still apply. If synthesis fails before audio delivery, you may retry once with provider set to another configured provider (xiaomi, doubao or breeze), keeping the same speechInstruction. Do not export and resend to bypass speak. Delivery reads all text in order and remains available when automatic speech is off. When automatic speech is on, use speak for an explicitly requested style so the automatic copy is suppressed. Put the full spoken reply in text, with no chat preamble. Successful delivery ends the turn unless replyWithText is true. If the retry also fails, reply in text and report the failure.'
        : ' Use the saved provider and voice unless the user explicitly requests a change. If synthesis fails before audio delivery, you may retry once with the other configured provider; omit model and voice overrides to use that provider\'s saved settings.')
      + BREEZE_AUDIO_TAG_GUIDANCE + XIAOMI_AUDIO_TAG_GUIDANCE + EXTERNAL_SPEECH_GUIDANCE
      + ' Do not retry a canceled request, denied delivery, partially delivered passage or an uncertain send outcome.',
    parameters: { type: 'object', properties: { ...properties, replyWithText }, required: ['text'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { adapter: { type: 'string' }, path: { type: 'string' }, messageId: { type: 'string' }, target: { type: 'string' } }, required: ['adapter'], additionalProperties: false },
      // QQBot may forward tool output as another chat message.
      render: (_args, value) => (value as { adapter: string }).adapter === 'qqbot' ? [] : [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const result = await send(speechRequest(args, exec.signal), exec)
      if (result.adapter === 'qqbot' && (args as SpeakOptions | null)?.replyWithText !== true) exec.concludeTurn()
      return result
    },
  }, options)
}

export function apply(ctx: Context, config: Config): void {
  // Existing DSH profiles may still carry the former shared-preset value.
  const delivery = config.delivery === 'conversation' ? 'file' : config.delivery
  const qq = delivery === 'qqbot'
  const sessionSpeech = observeSpeech(ctx, qq ? qqSpeechPolicy(ctx) : { ...config, delivery }, {
    suppressAutomatic: (agent, turn) => {
      const bridge = ctx.get('qqbotSpeech')
      return !!bridge && (qq || bridge.admitted(agent, turn))
    },
  })

  ctx.tools.register({
    name: 'synthesize_speech',
    description: 'Generate an audio file using the configured Host speech provider. Returns a local path for download, present or another delivery tool. Does not send it to a chat. Credentials stay on the Host. If synthesis fails, you may retry once with the other configured provider; omit model and voice overrides to use that provider\'s saved settings. Do not retry a canceled request.'
      + BREEZE_AUDIO_TAG_GUIDANCE + XIAOMI_AUDIO_TAG_GUIDANCE + EXTERNAL_SPEECH_GUIDANCE,
    parameters: { type: 'object', properties: { ...selection, format: { type: 'string', enum: ['mp3', 'wav', 'silk'] } }, required: ['text'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { path: { type: 'string' }, format: { type: 'string' }, size: { type: 'integer' } }, required: ['path', 'format', 'size'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const artifact = await ctx.speechSynthesis.exportAudio(speechRequest(args, exec.signal))
      return { path: artifact.path, format: artifact.format, size: artifact.size }
    },
  })
  registerSpeak(ctx, async (input, exec) => {
    const agent = speechOwner(exec)
    const bridge = ctx.get('qqbotSpeech')
    if (bridge?.admitted(agent)) return bridge.say(agent, input)
    if (qq && bridge) throw new TtsProviderError('qqbot-voice-unavailable', 'This turn has no QQ voice delivery route.', 409)
    return sessionSpeech.say(agent, input)
  }, qq)
  if (qq) return
  ctx.tools.register({
    name: 'speech_mode',
    description: 'Set automatic spoken replies for this conversation only, or inspect the current mode. Use auto when the user asks for future replies by voice; manual stops pending automatic speech. Long replies stay as text. Does not change the browser playback setting.',
    parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['manual', 'auto', 'status'] } }, required: ['mode'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { mode: { type: 'string' }, delivery: { type: 'string' }, available: { type: 'boolean' } }, required: ['mode', 'delivery', 'available'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args, exec) {
      const mode = (args as { mode?: unknown } | null)?.mode
      if (mode !== 'manual' && mode !== 'auto' && mode !== 'status') throw new TtsProviderError('invalid-speech-mode')
      exec.signal.throwIfAborted()
      const agent = speechOwner(exec)
      if (ctx.get('qqbotSpeech')?.admitted(agent)) throw new TtsProviderError('speech-mode-source-controlled', 'Use the Host QQ Bot source to change automatic speech.', 409)
      return sessionSpeech.mode(agent, mode)
    },
  })
}
