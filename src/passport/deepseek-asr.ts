import { DEEPSEEK_ASR_ENDPOINT } from '../constants.js'
import { pcmWave } from './audio.js'
import { recognitionError } from './asr-error.js'

export const DEEPSEEK_ASR_MAX_PCM = 120 * 32_000

export async function recognizeDeepseek(pcm: Buffer, key: string, signal: AbortSignal, timeoutMs: number): Promise<string> {
  signal.throwIfAborted()
  if (pcm.length > DEEPSEEK_ASR_MAX_PCM || pcm.length + 44 > 8 * 1024 * 1024) throw new Error('passport-recording-too-long')
  const timeout = AbortSignal.timeout(timeoutMs)
  const uploadSignal = AbortSignal.any([signal, timeout])
  const checkAbort = () => {
    signal.throwIfAborted()
    if (timeout.aborted) throw new Error('passport-asr-timeout')
  }
  const wave = pcmWave(pcm)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(wave)], { type: 'audio/wav' }), 'speech.wav')
  let response: Response
  try {
    response = await fetch(DEEPSEEK_ASR_ENDPOINT, {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}` }, body: form, signal: uploadSignal,
    })
  } catch {
    checkAbort()
    throw new Error('passport-asr-network-failed')
  }
  checkAbort()
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    const status = response.status
    if (status === 408 || status === 504) throw new Error('passport-asr-timeout')
    if (status === 413) throw new Error('passport-recording-too-long')
    throw recognitionError(status)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('passport-asr-invalid-response')
  const chunks: Buffer[] = []
  let length = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.length
      if (length > 256 * 1024) throw new Error('passport-asr-invalid-response')
      chunks.push(Buffer.from(item.value))
    }
    checkAbort()
  } catch (error) {
    checkAbort()
    if (error instanceof Error && error.message === 'passport-asr-invalid-response') throw error
    throw new Error('passport-asr-network-failed')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks, length).toString())
  } catch {
    throw new Error('passport-asr-invalid-response')
  }
  if (value === null || typeof value !== 'object' || !('text' in value) || typeof value.text !== 'string') throw new Error('passport-asr-invalid-response')
  return value.text
}
