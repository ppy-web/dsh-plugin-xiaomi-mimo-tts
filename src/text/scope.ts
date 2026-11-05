import type { TtsEffectiveReadScope, TtsReadScope } from '../types/index.js'
import { countTtsSpeechCharacters } from './segment.js'
import { firstTtsSegment, firstTtsSegments, splitBreezeTtsSentences, splitTtsSegments, TtsFirstSegmentLimiter } from './segment.js'
import { prepareBreezeTtsText, prepareTtsText } from './normalize.js'

/** Resolve Smart into a concrete range for this playback invocation. */
export function resolveTtsReadScope(scope: TtsReadScope, automatic: boolean): TtsEffectiveReadScope {
  return scope === 'first-segment' || (scope === 'smart' && automatic) ? 'first-segment' : 'full'
}

/** Apply a concrete read range to already-filtered speech text. */
export function applyTtsReadScope(value: string, scope: TtsEffectiveReadScope): string {
  return scope === 'first-segment' ? firstTtsSegment(value) : value
}

/** Natural spoken cues used when Smart automatic playback leaves substantial text unread. */
export const TTS_SMART_TRUNCATION_OUTROS = [
  '后面还有内容,先陪你念到这里啦~',
  '剩下的部分,查看文字回复吧。',
  '完整内容,你来接着往下看吧~',
  '后面内容太长了,我就不读了,请查阅。',
  '我先念到这里,后面的内容在文字回复里哦。',
  '这一段先帮你读到这里,剩下的继续看文字吧。',
] as const

const TTS_OUTRO_PAUSE_END = /[,.;:!?，。！？；、：…]$/u

/** Append one Smart-mode closing cue when the unread text is at least as long as the spoken segment. */
export function appendTtsSmartTruncationOutro(fullText: string, spokenText: string, random: () => number = Math.random): string {
  const spokenLength = countTtsSpeechCharacters(spokenText)
  const unreadLength = Math.max(0, countTtsSpeechCharacters(fullText) - spokenLength)
  if (spokenLength === 0 || unreadLength < spokenLength) return spokenText

  const trimmed = spokenText.trimEnd()
  const index = Math.min(TTS_SMART_TRUNCATION_OUTROS.length - 1, Math.max(0, Math.floor(random() * TTS_SMART_TRUNCATION_OUTROS.length)))
  const separator = TTS_OUTRO_PAUSE_END.test(trimmed) ? '' : '。'
  return `${trimmed}${separator}${TTS_SMART_TRUNCATION_OUTROS[index]}`
}

/** Apply the configured playback range to a completed reply. */
export function applyTtsPlaybackScope(value: string, scope: TtsReadScope, automatic: boolean, random: () => number = Math.random, prepare = prepareTtsText): string {
  if (prepare !== prepareTtsText) {
    const text = prepare(value)
    if (resolveTtsReadScope(scope, automatic) === 'full') return text
    const scoped = splitTtsSegments(text, undefined, undefined, prepare).slice(0, scope === 'smart' && automatic ? 2 : 1).join('')
    return scope === 'smart' && automatic ? appendTtsSmartTruncationOutro(text, scoped, random) : scoped
  }
  const scoped = scope === 'smart' && automatic
    ? firstTtsSegments(value, 2)
    : applyTtsReadScope(value, resolveTtsReadScope(scope, automatic))
  return scope === 'smart' && automatic
    ? appendTtsSmartTruncationOutro(value, scoped, random)
    : scoped
}

/**
 * Apply the configured playback range to Breeze text without dropping its
 * documented audio tags. Breeze tags are part of the spoken text, so the
 * regular scope helpers (which normalize punctuation away) cannot be used.
 */
export function applyBreezeTtsPlaybackScope(value: string, scope: TtsReadScope, automatic: boolean, random: () => number = Math.random): string {
  const prepared = prepareBreezeTtsText(value)
  if (prepared.length === 0) return ''
  if (scope === 'full' || (scope === 'smart' && !automatic)) return prepared
  const segments = scope === 'smart' ? 2 : 1
  const scoped = splitBreezeTtsSentences(prepared).slice(0, segments).join('')
  return scope === 'smart' && automatic ? appendTtsSmartTruncationOutro(prepared, scoped, random) : scoped
}

/** Apply the configured automatic range while a reply grows, adding Smart's cue only on completion. */
export function applyTtsLivePlaybackScope(
  value: string,
  scope: TtsReadScope,
  limiter: TtsFirstSegmentLimiter,
  final = false,
  random: () => number = Math.random,
  prepare = prepareTtsText,
): string {
  if (resolveTtsReadScope(scope, true) === 'full') return value
  const text = prepare(value)
  const scoped = limiter.limit(text, final)
  return final && scope === 'smart'
    ? appendTtsSmartTruncationOutro(text, scoped, random)
    : scoped
}
