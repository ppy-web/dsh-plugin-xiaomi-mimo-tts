import type { TtsEffectiveReadScope, TtsReadScope } from '../types/index.js'
import { countTtsSpeechCharacters, firstTtsSegment, splitBreezeTtsSentences, splitTtsSegments, TtsFirstSegmentLimiter } from './segment.js'
import { prepareBreezeTtsText, prepareTtsText } from './normalize.js'

/** Resolve Smart into a concrete range for this playback invocation. */
export function resolveTtsReadScope(scope: TtsReadScope, automatic: boolean): TtsEffectiveReadScope {
  if (scope === 'concise') return scope
  return scope === 'smart' && automatic ? 'first-segment' : 'full'
}

/** Apply non-Concise range limits on already-prepared speech text. */
export function applyNonConciseReadScope(value: string, scope: Exclude<TtsEffectiveReadScope, 'concise'>): string {
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
export function appendTtsSmartTruncationOutro(fullText: string, spokenText: string, random: () => number = Math.random, prepared = false): string {
  const spokenLength = countTtsSpeechCharacters(spokenText)
  const unreadLength = Math.max(0, countTtsSpeechCharacters(fullText) - spokenLength)
  if (spokenLength === 0 || unreadLength < spokenLength) return spokenText

  const trimmed = spokenText.trimEnd()
  const index = Math.min(TTS_SMART_TRUNCATION_OUTROS.length - 1, Math.max(0, Math.floor(random() * TTS_SMART_TRUNCATION_OUTROS.length)))
  const separator = TTS_OUTRO_PAUSE_END.test(trimmed) ? '' : prepared ? '.' : '。'
  const outro = TTS_SMART_TRUNCATION_OUTROS[index]!
  return `${trimmed}${separator}${prepared ? prepareTtsText(outro) : outro}`
}

/** Apply a non-Concise playback range without importing Concise Markdown parsing. */
export function applyNonConciseTtsPlaybackScope(
  value: string,
  scope: Exclude<TtsReadScope, 'concise'>,
  automatic: boolean,
  random: () => number = Math.random,
  prepare = prepareTtsText,
): string {
  if (prepare !== prepareTtsText) {
    const text = prepare(value)
    if (resolveTtsReadScope(scope, automatic) === 'full') return text
    const scoped = splitTtsSegments(text, undefined, undefined, item => item)[0] ?? ''
    return scope === 'smart' && automatic ? appendTtsSmartTruncationOutro(text, scoped, random, true) : scoped
  }
  const effective = resolveTtsReadScope(scope, automatic) as Exclude<TtsEffectiveReadScope, 'concise'>
  const scoped = applyNonConciseReadScope(value, effective)
  return scope === 'smart' && automatic
    ? appendTtsSmartTruncationOutro(value, scoped, random)
    : scoped
}

/** Apply non-Concise Breeze playback range without dropping documented audio tags. */
export function applyBreezeNonConcisePlaybackScope(
  value: string,
  scope: Exclude<TtsReadScope, 'concise'>,
  automatic: boolean,
  random: () => number = Math.random,
): string {
  const prepared = prepareBreezeTtsText(value)
  if (prepared.length === 0) return ''
  if (scope === 'full' || (scope === 'smart' && !automatic)) return prepared
  const scoped = splitBreezeTtsSentences(prepared, undefined, undefined, true)[0] ?? ''
  return scope === 'smart' && automatic ? appendTtsSmartTruncationOutro(prepared, scoped, random, true) : scoped
}

/** Apply the configured automatic range while a reply grows, adding Smart's cue only on completion. */
export function applyTtsLivePlaybackScope(
  value: string,
  scope: TtsReadScope,
  limiter: TtsFirstSegmentLimiter,
  final = false,
  random: () => number = Math.random,
  prepare: typeof prepareTtsText | false = prepareTtsText,
): string {
  if (scope === 'concise') return ''
  if (resolveTtsReadScope(scope, true) === 'full') return value
  const text = prepare ? prepare(value) : value
  const scoped = limiter.limitPrepared(text, final)
  return final && scope === 'smart'
    ? appendTtsSmartTruncationOutro(text, scoped, random, prepare === false)
    : scoped
}
