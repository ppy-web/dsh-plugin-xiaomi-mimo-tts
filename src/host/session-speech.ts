import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { prepareTtsText } from '../shared.js'
import type { SpeechDeliveryResult, SpeechRequest, SpeechSynthesisService } from '../host-api.js'
import type { SpeechMode, SpeechModeStore } from './speech-mode-store.js'
import { TtsProviderError } from './provider-error.js'

interface SessionState {
  agent: Agent
  mode: SpeechMode
  ready: Promise<void>
  turn: number
  seq: number
  ended: boolean
  text: string
  manual: boolean
  controller: AbortController
  pending: Set<Promise<unknown>>
  writes: Promise<void>
  modeRevision: number
}

export interface SessionSpeechOptions {
  delivery: string
  defaultMode: SpeechMode
  maxAutoCharacters: number
  maxDurationMs: number
  sourceControlled?: boolean
}

/** Live events only. Never reconstruct audio jobs from historical transcripts. */
export class SessionSpeech {
  private readonly states = new Map<Agent, SessionState>()
  private readonly pending = new Set<Promise<unknown>>()
  private disposed = false

  constructor(
    private readonly service: SpeechSynthesisService,
    private readonly store: Pick<SpeechModeStore, 'load' | 'save'>,
    private readonly options: SessionSpeechOptions,
    private readonly delivered: (agent: Agent, result: SpeechDeliveryResult, automatic: boolean) => void,
    private readonly failed: (code: string) => void,
  ) {}

  private state(agent: Agent): SessionState {
    if (this.disposed) throw new TtsProviderError('speech-agent-disposed')
    let state = this.states.get(agent)
    if (state) return state
    state = {
      agent, mode: this.options.defaultMode, ready: Promise.resolve(),
      turn: -1, seq: -1, ended: true, text: '', manual: false,
      controller: new AbortController(), pending: new Set(), writes: Promise.resolve(), modeRevision: 0,
    }
    const initial = state
    if (!this.options.sourceControlled) state.ready = this.store.load(agent.id, state.mode).then(mode => { initial.mode = mode }).catch(() => { this.failed('speech-mode-read-failed') })
    this.states.set(agent, state)
    return state
  }

  private track<T>(state: SessionState, task: Promise<T>): Promise<T> {
    state.pending.add(task)
    this.pending.add(task)
    const done = () => { state.pending.delete(task); this.pending.delete(task) }
    void task.then(done, done)
    return task
  }

  async mode(agent: Agent, action: SpeechMode | 'status'): Promise<{ mode: SpeechMode; delivery: string; available: boolean }> {
    const state = this.state(agent)
    await state.ready
    if (this.disposed || this.states.get(agent) !== state) throw new TtsProviderError('speech-agent-disposed')
    if (this.options.sourceControlled) {
      if (action !== 'status') throw new TtsProviderError('speech-mode-source-controlled', 'Automatic speech is controlled by the plugin integration setting.', 409)
      return { mode: this.service.isAutomaticDeliveryEnabled(this.options.delivery) ? 'auto' : 'manual', delivery: this.options.delivery, available: this.service.hasDelivery(this.options.delivery) }
    }
    if (action !== 'status') {
      if (action === 'auto' && !this.service.hasDelivery(this.options.delivery)) throw new TtsProviderError('speech-delivery-unavailable')
      // Queue writes even if a model dispatches two mode calls concurrently.
      const revision = ++state.modeRevision
      if (action === 'manual') { state.mode = 'manual'; state.controller.abort(); state.controller = new AbortController(); state.manual = true }
      const write = state.writes.catch(() => {}).then(async () => {
        await this.store.save(agent.id, action)
        if (!this.disposed && this.states.get(agent) === state && state.modeRevision === revision) state.mode = action
      })
      state.writes = write
      await write
    }
    return { mode: state.mode, delivery: this.options.delivery, available: this.service.hasDelivery(this.options.delivery) }
  }

  async say(agent: Agent, request: SpeechRequest): Promise<SpeechDeliveryResult> {
    const state = this.state(agent)
    // An explicit attempt suppresses automatic duplicates even if the send outcome is ambiguous.
    state.manual = true
    const signal = request.signal ? AbortSignal.any([request.signal, state.controller.signal]) : state.controller.signal
    const result = await this.track(state, this.service.deliver({ ...request, format: 'wav', ...this.requestPolicy(), signal }, this.options.delivery, { agent, signal }))
    signal.throwIfAborted()
    this.delivered(agent, result, false)
    return result
  }

  observe(agent: Agent, event: SessionEvent): void {
    if (this.disposed || agent.session.header.origin === 'subagent') return
    const state = this.state(agent)
    if (event.seq <= state.seq) return
    state.seq = event.seq
    if (event.type === 'turn/start') {
      if (event.data.turn <= state.turn) return
      state.controller.abort()
      state.controller = new AbortController()
      state.turn = event.data.turn
      state.ended = false
      state.text = ''
      state.manual = false
    } else if (event.type === 'assistant/message' && event.data.turn === state.turn && !state.ended) {
      const blocks = event.data.message.content
      state.text = event.data.interrupted || blocks.some(block => block.type === 'tool-call') ? '' : prepareTtsText(blocks.filter(block => block.type === 'text').map(block => block.text).join('\n'))
    } else if (event.type === 'turn/end' && event.data.turn === state.turn && !state.ended) {
      state.ended = true
      if (event.data.reason.kind !== 'completed') { state.controller.abort(); return }
      const { text, controller } = state
      if (!text || (this.options.maxAutoCharacters > 0 && [...text].length > this.options.maxAutoCharacters)) return
      const run = async () => {
        await state.ready
        const automatic = this.options.sourceControlled ? this.service.isAutomaticDeliveryEnabled(this.options.delivery) : state.mode === 'auto'
        if (controller.signal.aborted || this.disposed || !automatic || state.manual || !this.service.hasDelivery(this.options.delivery)) return
        const result = await this.service.deliver({ text, format: 'wav', ...this.requestPolicy(), signal: controller.signal }, this.options.delivery, { agent, signal: controller.signal, ...(this.options.sourceControlled ? { automatic: true } : {}) })
        controller.signal.throwIfAborted()
        this.delivered(agent, result, true)
      }
      void this.track(state, run()).catch(error => {
        if (!controller.signal.aborted) this.failed(error instanceof TtsProviderError ? error.code : 'speech-delivery-failed')
      })
    }
  }

  private requestPolicy(): Pick<SpeechRequest, 'maxDurationMs' | 'splitLongText'> {
    return {
      ...(this.options.maxDurationMs > 0 ? { maxDurationMs: this.options.maxDurationMs } : {}),
      ...(this.options.sourceControlled ? { splitLongText: true } : {}),
    }
  }

  release(agent: Agent): void {
    const state = this.states.get(agent)
    state?.controller.abort()
    this.states.delete(agent)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const states = [...this.states.values()]
    for (const state of states) state.controller.abort()
    await Promise.allSettled([...this.pending, ...states.flatMap(state => [state.writes, state.ready])])
    this.states.clear()
  }
}
