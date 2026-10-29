import { prepareTtsText } from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import { synthesizeDoubao, wrapPcmWav } from './doubao.js'
import type { DoubaoSessionOptions } from './doubao.js'
import { synthesizeXiaomi } from './xiaomi.js'
import { TtsProviderError } from './provider-error.js'
import { completeAudioLimit, synthesisOptions, validateSynthesisSettings } from './validation.js'
import type { CompleteAudioFormat } from './validation.js'
import type { SynthesizeBody } from './synthesis.js'

export interface SynthesisRuntime {
  connectDoubao?: NonNullable<DoubaoSessionOptions['connect']>
}

export function prepareSpeechRequest(current: ResolvedTtsSettings, body: SynthesizeBody): { settings: ResolvedTtsSettings; text: string } {
  const settings = synthesisOptions(current, body)
  const text = typeof body.text === 'string' ? prepareTtsText(body.text) : ''
  if (!text) throw new TtsProviderError('text-required', 'Enter text to synthesize.', 400)
  if (text.length > settings.maxTextLength) throw new TtsProviderError('text-too-long', 'Text exceeds the configured limit.', 413)
  validateSynthesisSettings(settings)
  return { settings, text }
}

/** Shared by HTTP, agent tools and integrations; the caller owns cancellation. */
export async function synthesizeCompleteAudio(settings: ResolvedTtsSettings, text: string, format: CompleteAudioFormat, controller: AbortController, runtime: SynthesisRuntime = {}): Promise<Buffer> {
  controller.signal.throwIfAborted()
  const limit = completeAudioLimit(settings, format)
  if (settings.provider === 'xiaomi') return synthesizeXiaomi(settings, text, format, limit, controller)
  const chunks: Buffer[] = []
  let size = 0
  await synthesizeDoubao(text, {
    ...(runtime.connectDoubao ? { connect: runtime.connectDoubao } : {}),
    settings, signal: controller.signal, format: format === 'wav' ? 'pcm' : 'mp3',
    onAudio: bytes => {
      size += bytes.length
      if (size + (format === 'wav' ? 44 : 0) > limit) throw new TtsProviderError('audio-too-large')
      chunks.push(bytes)
    },
  })
  const bytes = Buffer.concat(chunks)
  const audio = format === 'wav' ? wrapPcmWav(bytes) : bytes
  if (format === 'mp3' && !(audio.length >= 2 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0)))) throw new TtsProviderError('invalid-audio-format')
  return audio
}
