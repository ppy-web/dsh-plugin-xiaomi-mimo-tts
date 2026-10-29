import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session'
import z from '@deepseek-ai/schemastery'
import type { SpeechRequest } from './host-api.js'
import { SessionSpeech } from './host/session-speech.js'
import { SpeechModeStore } from './host/speech-mode-store.js'
import { TtsProviderError } from './host/provider-error.js'

export const name = 'speech-agent'
export const inject = ['speechSynthesis', 'tools', 'agents']
export const Config = z.object({
  delivery: z.string().default('file'),
  defaultMode: z.union(['manual', 'auto']).default('manual'),
  maxAutoCharacters: z.number().step(1).min(0).default(300),
  maxDurationMs: z.number().step(1).min(0).default(60000),
})
export type Config = ReturnType<typeof Config>

function owner(exec: ToolRunContext): Agent {
  if (!exec.agent) throw new TtsProviderError('speech-agent-required', 'Use this tool inside an agent conversation.', 400)
  return exec.agent
}

const selection = {
  text: { type: 'string', description: 'Text to read. Preserve the requested content; do not add narration.' },
  provider: { type: 'string', enum: ['xiaomi', 'doubao'] },
  model: { type: 'string' },
  voice: { type: 'string' },
  speechInstruction: { type: 'string' },
  voiceDesignPrompt: { type: 'string' },
  voiceRate: { type: 'number', minimum: 0.5, maximum: 2 },
} as const

function request(args: unknown, signal: AbortSignal): SpeechRequest {
  if (!args || typeof args !== 'object' || typeof (args as SpeechRequest).text !== 'string') throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
  return { ...args as SpeechRequest, signal }
}

export function apply(ctx: Context, config: Config): void {
  const sourceControlled = config.delivery === 'qqbot'
  const policy = sourceControlled ? { ...config, sourceControlled, maxAutoCharacters: 0, maxDurationMs: 0 } : config
  const sessionSpeech = new SessionSpeech(ctx.speechSynthesis, new SpeechModeStore(), policy,
    (agent, result, automatic) => { ctx.emit('speech/delivered', { agent, result, automatic }) },
    code => { ctx.logger.warn(`Speech integration: ${code}`) },
  )
  ctx.effect(() => () => sessionSpeech.dispose())
  ctx.on('session/event', (session, event) => {
    const agent = ctx.agents.get(session.id)
    if (agent) sessionSpeech.observe(agent, event)
  })
  ctx.on('agent/disposed', ({ agent }) => { sessionSpeech.release(agent) })

  ctx.tools.register({
    name: 'synthesize_speech',
    description: 'Generate an audio file using the configured Host speech provider. Returns a local path for download, present or another delivery tool. Does not send it to a chat. Credentials stay on the Host.',
    parameters: { type: 'object', properties: { ...selection, format: { type: 'string', enum: ['mp3', 'wav', 'silk'] } }, required: ['text'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { path: { type: 'string' }, format: { type: 'string' }, size: { type: 'integer' } }, required: ['path', 'format', 'size'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const artifact = await ctx.speechSynthesis.exportAudio(request(args, exec.signal))
      return { path: artifact.path, format: artifact.format, size: artifact.size }
    },
  })
  ctx.tools.register({
    name: 'speak',
    description: 'Read the requested text and deliver audio through this conversation\'s configured speech adapter. Use when asked to answer by voice or read a passage. A successful call already delivered the audio: do not send the file again. QQ delivery reads all text in order and remains available when automatic speech is off.',
    parameters: { type: 'object', properties: selection, required: ['text'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { adapter: { type: 'string' }, path: { type: 'string' }, messageId: { type: 'string' }, target: { type: 'string' } }, required: ['adapter'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => sessionSpeech.say(owner(exec), request(args, exec.signal)),
  })
  if (sourceControlled) return
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
      return sessionSpeech.mode(owner(exec), mode)
    },
  })
}
