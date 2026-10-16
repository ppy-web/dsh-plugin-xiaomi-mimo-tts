import { prepareTtsText } from './normalize.js'
import {
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  MAX_TTS_SEGMENT_CHARACTERS,
  MIN_TTS_SEGMENT_CHARACTERS,
  MIN_TTS_STREAM_CHARACTERS,
} from '../constants.js'

// Re-export for tests
export { MIN_TTS_STREAM_CHARACTERS }

/** Count text-bearing characters only, excluding punctuation and whitespace. */
export function countTtsSpeechCharacters(value: string): number {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).length
}

/** Find sentence ends after markup removal and punctuation normalization. */
function splitPreparedTtsSentences(text: string, final = true): { sentences: string[]; remainder: string } {
  const sentences: string[] = []
  let consumed = 0
  for (const match of text.matchAll(/[.!?;]+/gu)) {
    const end = match.index + match[0].length
    // A decimal point is part of a number, not the end of a sentence.
    if (match[0] === '.' && /\d/u.test(text[match.index - 1] ?? '')
      && (/\d/u.test(text[end] ?? '') || (!final && end === text.length))) continue
    sentences.push(text.slice(consumed, end))
    consumed = end
  }
  return { sentences, remainder: text.slice(consumed) }
}

/** Keep completed groups separate from a tail whose boundary may still change. */
function groupTtsSentences(pieces: readonly string[], preferred: number, maximum: number): { segments: string[]; pending: string } {
  const segments: string[] = []
  let pending = ''
  const append = (piece: string): void => {
    const candidate = `${pending}${piece}`.trim()
    if (candidate.length === 0) return
    if (countTtsSpeechCharacters(candidate) <= maximum) {
      pending = candidate
      if (countTtsSpeechCharacters(pending) >= preferred) {
        segments.push(pending)
        pending = ''
      }
      return
    }
    if (pending.length > 0) {
      segments.push(pending)
      pending = ''
    }
    // Keep an oversized sentence whole instead of ending playback mid-sentence.
    pending = piece.trim()
    if (countTtsSpeechCharacters(pending) >= preferred) {
      segments.push(pending)
      pending = ''
    }
  }
  for (const piece of pieces) append(piece)
  return { segments, pending }
}

/** Group whole sentences into short requests; a single long sentence may exceed the preferred maximum. */
export function splitTtsSegments(value: string, target = DEFAULT_TTS_SEGMENT_CHARACTERS, maximum = MAX_TTS_SEGMENT_CHARACTERS): string[] {
  const text = prepareTtsText(value)
  if (text.length === 0) return []
  const preferred = Math.max(MIN_TTS_SEGMENT_CHARACTERS, Math.min(target, maximum))
  const { sentences, remainder } = splitPreparedTtsSentences(text)
  const pieces = remainder.length > 0 ? [...sentences, remainder] : sentences
  const { segments, pending } = groupTtsSentences(pieces, preferred, maximum)
  if (pending.length > 0) {
    const last = segments.at(-1)
    if (last !== undefined && countTtsSpeechCharacters(pending) < MIN_TTS_SEGMENT_CHARACTERS && countTtsSpeechCharacters(`${last}${pending}`) <= maximum) segments[segments.length - 1] = `${last}${pending}`
    else segments.push(pending)
  }
  return segments
}

/** Return only the first semantic segment for low-latency VoiceDesign playback. */
export function firstTtsSegment(value: string): string {
  return splitTtsSegments(value)[0] ?? ''
}

/** Return the opening semantic segments used by a bounded playback scope. */
export function firstTtsSegments(value: string, count = 1): string {
  if (count <= 0) return ''
  return splitTtsSegments(value).slice(0, count).join('')
}

/** Keep the first semantic segment monotonic while an assistant reply is growing. */
export class TtsFirstSegmentLimiter {
  private locked: string | null = null

  constructor(private readonly segmentCount = 1) {}

  limit(value: string, final = false): string {
    if (this.locked !== null) return this.locked
    const text = prepareTtsText(value)
    if (final) {
      this.locked = firstTtsSegments(text, this.segmentCount)
      return this.locked
    }
    // Prefer completed sentence boundaries, but expose a sufficiently long
    // unfinished prefix so live PCM playback can begin during generation.
    const { sentences, remainder } = splitPreparedTtsSentences(text, false)
    const { segments, pending } = groupTtsSentences(sentences, DEFAULT_TTS_SEGMENT_CHARACTERS, MAX_TTS_SEGMENT_CHARACTERS)
    if (segments.length >= this.segmentCount) {
      this.locked = segments.slice(0, this.segmentCount).join('')
      return this.locked
    }
    const completed = `${segments.join('')}${pending}`
    // A short pending tail still occupies a segment: an unfinished sentence
    // may grow past the maximum and force that tail into a separate group.
    const occupiedSegments = segments.length + (pending.length > 0 ? 1 : 0)
    return occupiedSegments < this.segmentCount && countTtsSpeechCharacters(remainder) >= DEFAULT_TTS_SEGMENT_CHARACTERS
      // Keep a trailing period for decimal numbers; commas and other pause
      // marks can be normalized differently when the next token arrives.
      ? `${completed}${remainder}`.replace(/[^\p{L}\p{N}.]+$/u, '')
      : completed
  }
}

/** Accumulate short sentences for low-latency browser speech. */
export function batchTtsStreamText(pending: string, next: string, flush: boolean): { pending: string; request: string | null } {
  const combined = `${pending}${next}`
  if (countTtsSpeechCharacters(combined) >= MIN_TTS_STREAM_CHARACTERS || (flush && combined.trim().length > 0)) {
    return { pending: '', request: combined }
  }
  return { pending: combined, request: null }
}

/** Accumulate prepared sentences into PCM requests using the semantic segment sizes. */
export function batchTtsStreamSegments(pending: string, sentences: readonly string[], flush: boolean): { pending: string; requests: string[] } {
  const batch = groupTtsSentences([pending, ...sentences], DEFAULT_TTS_SEGMENT_CHARACTERS, MAX_TTS_SEGMENT_CHARACTERS)
  if (flush && batch.pending.length > 0) batch.segments.push(batch.pending)
  return { pending: flush ? '' : batch.pending, requests: batch.segments }
}
