import type SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { pcmWave } from './audio.js'
import { recognitionError } from './asr-error.js'
import { DoubaoRecognition } from './doubao-asr.js'
import type { WebSocket } from 'ws'

export type RecognitionSource = 'host' | 'xiaomi' | 'doubao' | 'doubao-nostream'
export interface RecognitionInput {
  append(pcm: Buffer): void
  finish(): Promise<string>
  cancel(): void
}
export interface PassportRecognizer {
  check(): void
  create(signal: AbortSignal, maxBytes: number): RecognitionInput
}
export interface RecognitionChoice { id: RecognitionSource; configured: boolean }
export interface PassportRecognitionService {
  choices(): RecognitionChoice[]
  recognizer(source: RecognitionSource, host?: Pick<SpeechToText, 'snapshot' | 'resolve' | 'transcribe'>): PassportRecognizer
}
declare module '@deepseek-ai/cordis' {
  interface Context { passportRecognition: PassportRecognitionService }
}

export function hostRecognizer(host?: Pick<SpeechToText, 'snapshot' | 'resolve' | 'transcribe'>): PassportRecognizer {
  const check = () => {
    const snapshot = host?.snapshot()
    if (!snapshot?.providers.some(p => p.id === snapshot.selection.providerId && ['ready', 'standby'].includes(p.preparation.phase))) throw new Error('passport-asr-unavailable')
  }
  return {
    check,
    create: (signal, maxBytes) => bufferedRecognition(signal, maxBytes, async pcm => {
      check()
      const audio = pcmWave(pcm)
      return (await host!.transcribe(host!.resolve({ audio }), signal)).text
    }),
  }
}

function bufferedRecognition(signal: AbortSignal, maxBytes: number, run: (pcm: Buffer) => Promise<string>): RecognitionInput {
  const chunks: Buffer[] = []
  let size = 0, cancelled = false
  return {
    append(pcm) {
      signal.throwIfAborted()
      if (cancelled) throw new Error('passport-recognition-cancelled')
      size += pcm.length
      if (size > maxBytes) throw new Error('passport-recording-too-long')
      chunks.push(Buffer.from(pcm))
    },
    async finish() {
      signal.throwIfAborted()
      if (cancelled) throw new Error('passport-recognition-cancelled')
      try { const text = await run(Buffer.concat(chunks)); signal.throwIfAborted(); return text.trim() }
      finally { chunks.length = 0 }
    },
    cancel() { cancelled = true; chunks.length = 0 },
  }
}

/** Settle on cancellation even when a provider ignores its signal. */
function abortableRecognition(task: Promise<string>, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener('abort', abort)
    const abort = (): void => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    task.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

/** Reads only the saved built-in keys, independently of TTS selection/takeover. */
export class PassportRecognition implements PassportRecognitionService {
  private doubaoKey = ''
  private doubaoPlan = false
  private disposed = false
  private readonly active = new Set<AbortController>()
  constructor(private readonly current: () => ResolvedTtsSettings,
    private readonly connectDoubao?: (url: string, headers: Record<string, string>) => WebSocket) {}
  private enabled(): boolean { return !this.disposed && this.current().voiceRecognitionService !== false }
  refresh(): void {
    if (!this.enabled()) for (const controller of this.active) controller.abort(new Error('passport-asr-disabled'))
  }
  dispose(): void {
    this.disposed = true
    for (const controller of this.active) controller.abort(new Error('passport-asr-unavailable'))
  }
  choices(): RecognitionChoice[] {
    const settings = this.current()
    return [{ id: 'host', configured: true }, { id: 'xiaomi', configured: !!settings.apiKey.trim() }, { id: 'doubao', configured: !!settings.doubaoApiKey.trim() }, { id: 'doubao-nostream', configured: !!settings.doubaoApiKey.trim() }]
  }
  recognizer(source: RecognitionSource, host?: Pick<SpeechToText, 'snapshot' | 'resolve' | 'transcribe'>): PassportRecognizer {
    if (source === 'host') return hostRecognizer(host)
    const key = () => (source === 'xiaomi' ? this.current().apiKey : this.current().doubaoApiKey).trim()
    const check = () => {
      if (!this.enabled()) throw new Error(this.disposed ? 'passport-asr-unavailable' : 'passport-asr-disabled')
      if (!key()) throw new Error('passport-asr-key-required')
    }
    return { check, create: (signal, maxBytes) => {
      check()
      signal.throwIfAborted()
      const savedKey = key()
      const controller = new AbortController()
      const activeSignal = AbortSignal.any([signal, controller.signal])
      let input: RecognitionInput
      if (source === 'doubao' || source === 'doubao-nostream') {
        if (this.doubaoKey !== savedKey) { this.doubaoKey = savedKey; this.doubaoPlan = false }
        input = new DoubaoRecognition(savedKey, activeSignal, maxBytes, this.doubaoPlan, plan => {
          if (this.doubaoKey === savedKey) this.doubaoPlan = plan
        }, this.connectDoubao, source === 'doubao-nostream' ? 'nostream' : 'async')
      } else input = bufferedRecognition(activeSignal, maxBytes, async pcm => {
        const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
          method: 'POST', redirect: 'error', signal: activeSignal,
          headers: { 'api-key': savedKey, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'mimo-v2.5-asr', stream: false, asr_options: { language: 'auto' },
            messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${pcmWave(pcm).toString('base64')}` } }] }] }),
        })
        // Bound both successful and rejected response bodies, and never expose upstream prose.
        const reader = response.body?.getReader()
        if (!reader) throw recognitionError(response.status)
        const chunks: Buffer[] = []; let size = 0
        try {
          for (;;) {
            const item = await reader.read()
            if (item.done) break
            size += item.value.length
            if (size > 256 * 1024) throw new Error('passport-asr-invalid-response')
            chunks.push(Buffer.from(item.value))
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
        const data = JSON.parse(Buffer.concat(chunks).toString()) as { error?: { code?: string }; choices?: { finish_reason?: string; message?: { content?: unknown } }[] }
        if (!response.ok) throw recognitionError(response.status, String(data.error?.code ?? ''))
        const result = data.choices?.[0]
        if (result?.finish_reason !== 'stop' || typeof result.message?.content !== 'string') throw new Error('passport-asr-invalid-response')
        return result.message.content
      })
      this.active.add(controller)
      let released = false
      const release = (): void => {
        if (released) return
        released = true
        activeSignal.removeEventListener('abort', abort)
        this.active.delete(controller)
      }
      const abort = (): void => { try { input.cancel() } finally { release() } }
      activeSignal.addEventListener('abort', abort, { once: true })
      if (activeSignal.aborted) abort()
      return {
        append(pcm) { activeSignal.throwIfAborted(); input.append(pcm) },
        async finish() {
          activeSignal.throwIfAborted()
          try { return await abortableRecognition(input.finish(), activeSignal) } finally { release() }
        },
        cancel() {
          if (released) input.cancel()
          else controller.abort(new Error('passport-recognition-cancelled'))
        },
      }
    } }
  }
}
