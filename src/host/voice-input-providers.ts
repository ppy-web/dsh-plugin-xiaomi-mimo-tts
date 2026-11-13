import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { SpeechProvider, SpeechProviderId } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { PassportRecognitionService, RecognitionSource } from '../passport/recognition.js'
import { abortable } from './external-providers.js'

type CloudSource = Exclude<RecognitionSource, 'host'>
const SOURCES: readonly { source: CloudSource; id: string; name: string }[] = [
  { source: 'xiaomi', id: 'xiaomi-mimo-tts-asr', name: 'Xiaomi MiMo ASR' },
  { source: 'doubao', id: 'xiaomi-mimo-tts-doubao-asr', name: 'Doubao real-time ASR' },
  { source: 'doubao-nostream', id: 'xiaomi-mimo-tts-doubao-utterance-asr', name: 'Doubao utterance ASR' },
]
const MAX_PCM_BYTES = 4 * 1024 * 1024
const SAFE_ERRORS = new Set(['passport-asr-key-required', 'passport-asr-auth-failed', 'passport-asr-permission-denied',
  'passport-asr-quota-exceeded', 'passport-asr-rate-limited', 'passport-asr-timeout', 'passport-asr-network-failed',
  'passport-asr-invalid-response', 'passport-asr-input-overflow', 'passport-recording-too-long'])

/** Host dictation supplies canonical 16 kHz mono PCM16 WAV. */
function pcmFromWave(audio: Uint8Array): Buffer {
  const wave = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
  if (wave.length < 46 || wave.length - 44 > MAX_PCM_BYTES || wave.toString('ascii', 0, 4) !== 'RIFF'
    || wave.readUInt32LE(4) !== wave.length - 8 || wave.toString('ascii', 8, 16) !== 'WAVEfmt '
    || wave.readUInt32LE(16) !== 16 || wave.readUInt16LE(20) !== 1 || wave.readUInt16LE(22) !== 1
    || wave.readUInt32LE(24) !== 16000 || wave.readUInt32LE(28) !== 32000 || wave.readUInt16LE(32) !== 2
    || wave.readUInt16LE(34) !== 16 || wave.toString('ascii', 36, 40) !== 'data'
    || wave.readUInt32LE(40) !== wave.length - 44 || (wave.length - 44) % 2) throw new Error('passport-invalid-audio')
  return wave.subarray(44)
}

/** Adapt the existing Passport recognizers to the Host's dictation provider contract. */
export function voiceInputProvider(source: CloudSource, id: string, name: string, recognition: PassportRecognitionService): SpeechProvider {
  return {
    info: { id: id as SpeechProviderId, name, location: 'cloud', languages: ['auto'] },
    async transcribe({ audio }, signal) {
      signal.throwIfAborted()
      const pcm = pcmFromWave(audio)
      const started = Date.now()
      const recognizer = recognition.recognizer(source)
      let input: ReturnType<typeof recognizer.create> | undefined
      try {
        recognizer.check()
        input = recognizer.create(signal, MAX_PCM_BYTES)
        input.append(pcm)
        const text = await abortable(input.finish(), signal)
        signal.throwIfAborted()
        return { text, audioSeconds: pcm.length / 32000, inferenceSeconds: (Date.now() - started) / 1000 }
      } catch (error) {
        signal.throwIfAborted()
        const code = error instanceof Error ? error.message : ''
        if (code === 'passport-no-speech') return { text: '', audioSeconds: pcm.length / 32000, inferenceSeconds: (Date.now() - started) / 1000 }
        throw new Error(SAFE_ERRORS.has(code) ? code : 'passport-recognition-failed')
      } finally { input?.cancel() }
    },
  }
}

export function registerVoiceInputProviders(ctx: Context, enabled: () => boolean, subscribe: (update: () => void) => () => void): void {
  ctx.effect(() => {
    let disposed = false
    let registrations: (() => Promise<void>)[] = []
    let pending = Promise.resolve()
    const withdraw = async (): Promise<void> => {
      const active = registrations
      registrations = []
      await Promise.allSettled(active.map(async remove => { await remove() }))
    }
    const update = (): void => {
      // Serialize withdrawal and registration so quick toggles cannot create duplicate providers.
      pending = pending.then(async () => {
        if (disposed || !enabled()) { await withdraw(); return }
        if (registrations.length > 0) return
        try {
          for (const item of SOURCES) registrations.push(ctx.speechToText.register(voiceInputProvider(item.source, item.id, item.name, ctx.passportRecognition)))
        } catch (error) {
          await withdraw()
          throw error
        }
      }).catch(error => { ctx.logger.error('xiaomi-mimo-tts: unable to update Host speech recognition providers', error) })
    }
    const unsubscribe = subscribe(update)
    update()
    return async () => {
      disposed = true
      unsubscribe()
      update()
      await pending
    }
  }, 'xiaomi-mimo-tts: Host speech recognition providers')
}
