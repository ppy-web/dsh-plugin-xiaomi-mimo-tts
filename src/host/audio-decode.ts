import type { Response } from 'undici'
import type { XiaomiAudioResponse } from './synthesis.js'
import type { CompleteAudioFormat } from './validation.js'
import { CompleteAudioResponseError } from './validation.js'
import { strictBase64DecodedLength } from '../utils/index.js'

export async function readLimitedXiaomiResponse(response: Response, limit: number, controller: AbortController): Promise<XiaomiAudioResponse | undefined> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > limit) {
    controller.abort()
    throw new CompleteAudioResponseError('xiaomi-response-too-large')
  }
  if (response.body === null) return undefined

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) {
        controller.abort()
        throw new CompleteAudioResponseError('xiaomi-response-too-large')
      }
      chunks.push(Buffer.from(chunk.value))
    }
  } finally {
    reader.releaseLock()
  }
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as XiaomiAudioResponse
  } catch {
    return undefined
  }
}

export function decodeCompleteAudio(value: string, format: CompleteAudioFormat, limit: number): Buffer {
  const expectedLength = strictBase64DecodedLength(value)
  if (expectedLength === null) throw new CompleteAudioResponseError('invalid-audio-base64')
  if (expectedLength > limit) throw new CompleteAudioResponseError('audio-too-large')

  const audio = Buffer.from(value, 'base64')
  if (audio.byteLength !== expectedLength) throw new CompleteAudioResponseError('invalid-audio-base64')
  const validFormat = format === 'wav'
    ? audio.byteLength >= 12 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE'
    : audio.byteLength >= 2 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xFF && (audio[1]! & 0xE0) === 0xE0))
  if (!validFormat) throw new CompleteAudioResponseError('invalid-audio-format')
  return audio
}
