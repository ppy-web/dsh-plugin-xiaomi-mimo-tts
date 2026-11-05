import { applyTtsLivePlaybackScope, TtsFirstSegmentLimiter, countTtsSpeechCharacters, stripXiaomiAudioTags, stripBreezeAudioTags } from '../../shared.js'
import type { LiveSpeechCursor, TtsLocalSpeechMode, TtsReadScope } from '../../shared.js'
import type { LiveSpeechController } from './live-speech-controller.js'
import type { LocalSpeechController } from './local-speech-controller.js'
import type { LiveMessageIdentity } from './types.js'
import { prepareSpeechText } from './speech-text.js'

interface SpeechOptions {
  localSpeechMode: TtsLocalSpeechMode
  apiKeySupported: boolean | null
  readScope: TtsReadScope
}

interface SpeechStep {
  cursor: LiveSpeechCursor
  limiter: TtsFirstSegmentLimiter
  text: string
  checkpoint: string | null
  final: LiveMessageIdentity | null
  inputFinished: boolean
}

type SpeechBackend = 'live' | 'system'

interface SpeechTurn {
  turn: number
  backend: SpeechBackend
  fallback: boolean
  scope: TtsReadScope
  steps: Map<number, SpeechStep>
}

/** Own one turn's backend and retain its final messages until asynchronous synthesis settles. */
export class RealtimeSpeechSession {
  private sessionId: string | null = null
  private turn: SpeechTurn | null = null
  private revision = 0
  private options: SpeechOptions = { localSpeechMode: 'auto', apiKeySupported: null, readScope: 'smart' }

  constructor(private readonly live: LiveSpeechController, private readonly local: LocalSpeechController) {}

  configure(options: SpeechOptions): void { this.options = options }

  activate(sessionId: string): void {
    if (this.sessionId === sessionId) return
    this.cancel()
    this.sessionId = sessionId
    this.live.activateSession(sessionId)
    this.local.activateSession(sessionId)
  }

  deactivate(sessionId: string): void {
    if (this.sessionId !== sessionId) return
    this.cancel()
    this.live.deactivateSession(sessionId)
    this.local.deactivateSession(sessionId)
    this.sessionId = null
  }

  cancel(): void {
    this.revision += 1
    this.turn = null
    this.live.setFallbackHandler(null)
    this.local.setFallbackHandler(null)
    if (this.sessionId !== null) {
      this.live.cancelSession(this.sessionId)
      this.local.cancelSession(this.sessionId)
    }
  }

  observe(sessionId: string, turn: number, step: number, markdown: string, prime = false): void {
    if (this.sessionId !== sessionId) return
    if (this.turn === null || this.turn.turn !== turn) this.beginTurn(turn)
    const current = this.turn!
    let message = current.steps.get(step)
    if (message === undefined) {
      message = {
        cursor: { sessionId, turn, step },
        limiter: new TtsFirstSegmentLimiter(current.scope === 'smart' ? 2 : 1, value => this.live.prepareText(value)),
        text: '', checkpoint: null, final: null, inputFinished: false,
      }
      current.steps.set(step, message)
    }
    if (message.inputFinished) return
    message.text = this.scopeText(markdown, message)
    const controller = this.controller(current.backend)
    if (prime) {
      message.checkpoint = message.text
      controller.prime(sessionId, turn, step, this.backendText(current.backend, message.text))
    }
    controller.observe(sessionId, turn, step, this.backendText(current.backend, message.text))
    if (current.backend === 'live' && this.live.isDuplex() && message.limiter.complete && current.scope !== 'full') {
      const prepared = prepareSpeechText(markdown)
      const spoken = countTtsSpeechCharacters(message.text)
      if (current.scope === 'first-segment' || countTtsSpeechCharacters(prepared) >= spoken * 2) {
        message.text = this.scopeText(markdown, message, true)
        controller.observe(sessionId, turn, step, this.backendText(current.backend, message.text))
        message.inputFinished = true
        this.live.finishInput(sessionId, turn, step)
      }
    }
  }

  finish(sessionId: string, final: LiveMessageIdentity): void {
    if (this.sessionId !== sessionId || this.turn?.turn !== final.turn) return
    const message = this.turn.steps.get(final.step)
    if (message === undefined || message.final !== null) return
    if (final.interrupted) {
      this.cancel()
      this.live.blockTurn(sessionId, final.turn)
      this.local.blockTurn(sessionId, final.turn)
      return
    }
    if (!message.inputFinished) message.text = this.scopeText(final.text, message, true)
    message.final = { ...final, text: message.text }
    this.controller(this.turn.backend).finish(sessionId, { ...message.final, text: this.backendText(this.turn.backend, message.final.text) })
  }

  private beginTurn(turn: number): void {
    this.cancel()
    const { localSpeechMode, apiKeySupported, readScope } = this.options
    const localFirst = localSpeechMode === 'local-first'
      || (localSpeechMode === 'auto' && apiKeySupported === false)
    this.turn = {
      turn, backend: localFirst ? 'system' : 'live', scope: readScope, steps: new Map(),
      fallback: localSpeechMode === 'local-first' || (localSpeechMode === 'auto' && !localFirst),
    }
    this.installFallback()
  }

  private backendText(backend: SpeechBackend, text: string): string {
    return backend === 'system' ? stripXiaomiAudioTags(stripBreezeAudioTags(text)) : text
  }

  private controller(backend: SpeechBackend): LiveSpeechController | LocalSpeechController {
    return backend === 'live' ? this.live : this.local
  }

  private scopeText(markdown: string, message: SpeechStep, final = false): string {
    return applyTtsLivePlaybackScope(this.live.prepareText(markdown), this.turn!.scope, message.limiter, final, Math.random, value => this.live.prepareText(value))
  }

  private installFallback(): void {
    this.live.setFallbackHandler(null)
    this.local.setFallbackHandler(null)
    const current = this.turn
    if (current === null || !current.fallback) return
    const revision = this.revision
    this.controller(current.backend).setFallbackHandler(cursor => {
      if (revision !== this.revision || this.turn !== current || cursor.sessionId !== this.sessionId || cursor.turn !== current.turn) return
      current.backend = current.backend === 'live' ? 'system' : 'live'
      current.fallback = false
      this.installFallback()
      const target = this.controller(current.backend)
      for (const message of current.steps.values()) {
        const { sessionId, turn, step } = message.cursor
        if (message.checkpoint !== null) target.prime(sessionId, turn, step, this.backendText(current.backend, message.checkpoint))
        target.observe(sessionId, turn, step, this.backendText(current.backend, message.text))
        if (message.final !== null) target.finish(sessionId, { ...message.final, text: this.backendText(current.backend, message.final.text) })
      }
    })
  }
}
