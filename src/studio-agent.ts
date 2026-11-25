import type { Context } from '@deepseek-ai/cordis'
import type { ToolRegistrationOptions } from '@deepseek-ai/dsh-tools'
import type { StudioLineInput, StudioRoleInput, StudioRoleProvider } from './host-api.js'
import { STUDIO_MAX_LINE_CHARACTERS, STUDIO_MAX_LINES_PER_SCRIPT } from './shared.js'
import { findMatchingStudioRole } from './text/studio-script-parser.js'
import { TtsProviderError } from './host/provider-error.js'
import type {} from './host/speech-service.js'

export const name = 'studio-agent'
export const inject = ['speechStudio', 'speechSynthesis', 'tools']

export function registerStudioTools(ctx: Context, options?: ToolRegistrationOptions): () => void {
  const disposers: Array<() => void> = []
  const register = (tool: Parameters<Context['tools']['register']>[0]): void => {
    const dispose = ctx.tools.register(tool, options)
    if (typeof dispose === 'function') disposers.push(dispose)
  }

  register({
    name: 'studio_inspect',
    description: 'Inspect configured speech providers, available voices, existing Recording Studio roles, scripts, background tasks, and disk usage. Call this before creating roles or scripts.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      exec.signal.throwIfAborted()
      const [capabilities, studio] = await Promise.all([
        Promise.resolve(ctx.speechSynthesis.capabilities()),
        ctx.speechStudio.snapshot(),
      ])
      return {
        provider: capabilities.provider,
        providers: capabilities.providers.map(p => ({
          id: p.id,
          ready: p.ready,
          selectedModel: p.selectedModel,
          selectedVoice: p.selectedVoice,
          models: p.models.map(m => ({ id: m.id, voices: m.voices.slice(0, 20), speechInstruction: m.speechInstruction, audioTags: m.audioTags, voiceRate: m.voiceRate })),
        })),
        studio,
      }
    },
  })

  register({
    name: 'studio_save_role',
    description: 'Create or update a reusable Recording Studio cast role bound to any supported Host voice engine (xiaomi, doubao, breeze, deepseek, moss, or external:*). Prefer reusing existing roles from studio_inspect instead of creating duplicates; omit id only for genuinely new characters (a matching existing role name updates that role in place).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional existing role ID to update.' },
        name: { type: 'string', description: 'Display name of the character (1..32 chars).' },
        color: { type: 'string', description: 'Optional hex accent color like #3b82f6.' },
        provider: { type: 'string', description: 'Voice engine: xiaomi, doubao, breeze, deepseek, moss, or external:<id>.' },
        model: { type: 'string', description: 'Optional model ID for the chosen provider.' },
        voice: { type: 'string', description: 'Voice preset or custom voice ID.' },
        voiceDesignPrompt: { type: 'string', description: 'Voice description when using Xiaomi mimo-v2.5-tts-voicedesign.' },
        speechInstruction: { type: 'string', description: 'Default tone/emotion delivery instruction for this role.' },
        voiceRate: { type: 'number', minimum: 0.5, maximum: 2, description: 'Default speech speed (0.5..2.0).' },
      },
      required: ['name', 'provider'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const input = (args ?? {}) as Record<string, unknown>
      const name = typeof input.name === 'string' ? input.name : ''
      let resolvedId = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : undefined
      if (!resolvedId && name.trim()) {
        const snap = await ctx.speechStudio.snapshot()
        const matched = findMatchingStudioRole(snap.roles, name, undefined, { allowAliasMatch: false })
        if (matched) resolvedId = matched.id
      }
      const role = await ctx.speechStudio.saveRole({
        ...(resolvedId ? { id: resolvedId } : {}),
        name,
        ...(typeof input.color === 'string' ? { color: input.color } : {}),
        provider: input.provider as StudioRoleProvider,
        ...(typeof input.model === 'string' ? { model: input.model } : {}),
        ...(typeof input.voice === 'string' ? { voice: input.voice } : {}),
        ...(typeof input.voiceDesignPrompt === 'string' ? { voiceDesignPrompt: input.voiceDesignPrompt } : {}),
        ...(typeof input.speechInstruction === 'string' ? { speechInstruction: input.speechInstruction } : {}),
        ...(typeof input.voiceRate === 'number' ? { voiceRate: input.voiceRate } : {}),
      } satisfies StudioRoleInput)
      return { role }
    },
  })

  register({
    name: 'studio_save_script',
    description: `Create or update a structured multi-role Studio script (up to ${STUDIO_MAX_LINES_PER_SCRIPT} lines, ${STUDIO_MAX_LINE_CHARACTERS} chars per line). Every line must reference an existing roleId.`,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional existing script ID to update.' },
        title: { type: 'string', description: 'Script title.' },
        description: { type: 'string', description: 'Optional scene or cast notes.' },
        lines: {
          type: 'array',
          maxItems: STUDIO_MAX_LINES_PER_SCRIPT,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              roleId: { type: 'string', description: 'Existing Studio role ID.' },
              text: { type: 'string', description: `Spoken dialogue (1..${STUDIO_MAX_LINE_CHARACTERS} chars).` },
              speechInstruction: { type: 'string', description: 'Optional per-line delivery override.' },
              pauseAfterMs: { type: 'integer', minimum: 0, maximum: 5000, description: 'Silence after this line in ms (default 400).' },
            },
            required: ['roleId', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'lines'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const input = (args ?? {}) as Record<string, unknown>
      const script = await ctx.speechStudio.saveScript({
        ...(typeof input.id === 'string' ? { id: input.id } : {}),
        title: typeof input.title === 'string' ? input.title : '',
        ...(typeof input.description === 'string' ? { description: input.description } : {}),
        lines: Array.isArray(input.lines) ? input.lines as StudioLineInput[] : [],
      })
      return { script }
    },
  })

  register({
    name: 'studio_import_script',
    description: 'Parse plain-text drama script (`Role (emotion) [pause 0.8s]: dialogue`) into a saved Studio script, automatically matching existing roles or creating default roles for unseen speakers.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional existing script ID to overwrite.' },
        title: { type: 'string', description: 'Script title.' },
        description: { type: 'string', description: 'Optional notes.' },
        text: { type: 'string', description: 'Raw script text with one speaker line per row.' },
        defaultNarratorName: { type: 'string', description: 'Fallback narrator role name for unprefixed lines.' },
      },
      required: ['title', 'text'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const input = (args ?? {}) as Record<string, unknown>
      return ctx.speechStudio.importScript({
        ...(typeof input.id === 'string' ? { id: input.id } : {}),
        title: typeof input.title === 'string' ? input.title : '',
        ...(typeof input.description === 'string' ? { description: input.description } : {}),
        text: typeof input.text === 'string' ? input.text : '',
        ...(typeof input.defaultNarratorName === 'string' ? { defaultNarratorName: input.defaultNarratorName } : {}),
      })
    },
  })

  register({
    name: 'studio_task_control',
    description: 'Start a persistent background Recording Studio synthesis task from a saved scriptId, or pause, resume, cancel, or inspect task status and output audio path.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'pause', 'resume', 'cancel', 'status'] },
        scriptId: { type: 'string', description: 'Required when action is start.' },
        title: { type: 'string', description: 'Optional episode title override when starting.' },
        taskId: { type: 'string', description: 'Target task ID for pause, resume, cancel, or status.' },
        autoStart: { type: 'boolean', description: 'Set false when starting to create a paused draft task instead of synthesizing immediately.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const input = (args ?? {}) as Record<string, unknown>
      const action = typeof input.action === 'string' ? input.action : ''
      const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
      if (action === 'start') {
        const task = await ctx.speechStudio.startTask({
          ...(typeof input.scriptId === 'string' ? { scriptId: input.scriptId } : {}),
          ...(typeof input.title === 'string' ? { title: input.title } : {}),
          ...(typeof input.autoStart === 'boolean' ? { autoStart: input.autoStart } : {}),
        })
        return { task }
      }
      if (action === 'pause') {
        if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
        return { task: await ctx.speechStudio.pauseTask(taskId) }
      }
      if (action === 'resume') {
        if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
        return { task: await ctx.speechStudio.resumeTask(taskId) }
      }
      if (action === 'cancel') {
        if (!taskId) throw new TtsProviderError('invalid-studio-id', undefined, 400)
        return { task: await ctx.speechStudio.cancelTask(taskId) }
      }
      if (action === 'status') {
        const snap = await ctx.speechStudio.snapshot()
        if (!taskId) return { tasks: snap.tasks }
        const task = snap.tasks.find(item => item.id === taskId)
        if (!task) throw new TtsProviderError('studio-task-not-found', undefined, 404)
        let audioPath: string | undefined
        if (task.status === 'completed') {
          audioPath = (await ctx.speechStudio.getTaskAudioFile(taskId).catch(() => null))?.path
        }
        return { task, ...(audioPath ? { audioPath } : {}) }
      }
      throw new TtsProviderError('invalid-request', undefined, 400)
    },
  })

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}

export function apply(ctx: Context): void {
  registerStudioTools(ctx)
}
