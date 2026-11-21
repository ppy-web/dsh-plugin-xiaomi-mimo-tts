import type { TtsEffectiveReadScope, TtsReadScope } from '../types/index.js'
import { prepareTtsText } from './normalize.js'
import { prepareConciseTtsText } from './concise.js'
import {
  TTS_SMART_TRUNCATION_OUTROS,
  appendTtsSmartTruncationOutro,
  applyBreezeNonConcisePlaybackScope,
  applyNonConciseReadScope,
  applyNonConciseTtsPlaybackScope,
  applyTtsLivePlaybackScope,
  resolveTtsReadScope,
} from './scope-light.js'

export {
  TTS_SMART_TRUNCATION_OUTROS,
  appendTtsSmartTruncationOutro,
  applyTtsLivePlaybackScope,
  resolveTtsReadScope,
}

/** Concise takes raw Markdown. The other ranges use their normal text preparation. */
export function applyTtsReadScope(value: string, scope: TtsEffectiveReadScope, _voiceRate = 1): string {
  if (scope === 'concise') return prepareConciseTtsText(value)
  return applyNonConciseReadScope(value, scope)
}

/** Apply the configured playback range to a completed reply. */
export function applyTtsPlaybackScope(value: string, scope: TtsReadScope, automatic: boolean, random: () => number = Math.random, prepare = prepareTtsText): string {
  if (scope === 'concise') return prepareConciseTtsText(value)
  return applyNonConciseTtsPlaybackScope(value, scope, automatic, random, prepare)
}

/**
 * Apply the configured playback range to Breeze text without dropping its
 * documented audio tags. Breeze tags are part of the spoken text, so the
 * regular scope helpers (which normalize punctuation away) cannot be used.
 */
export function applyBreezeTtsPlaybackScope(value: string, scope: TtsReadScope, automatic: boolean, random: () => number = Math.random): string {
  if (scope === 'concise') return prepareConciseTtsText(value)
  return applyBreezeNonConcisePlaybackScope(value, scope, automatic, random)
}
