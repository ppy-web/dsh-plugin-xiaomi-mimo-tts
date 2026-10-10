import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyTtsLivePlaybackScope,
  applyTtsPlaybackScope,
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  firstTtsSegment,
  MAX_TTS_SEGMENT_CHARACTERS,
  prepareTtsText,
  splitTtsSegments,
  TtsFirstSegmentLimiter,
  TTS_SMART_TRUNCATION_OUTROS,
} from '../lib/shared.js'

test('keeps long sentences whole across synthesis chunks and opening playback', () => {
  const sentences = [
    `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`,
    `${'乙'.repeat(100)}，${'丙'.repeat(180)}。`,
    '最后一句。',
  ].map(prepareTtsText)
  const text = sentences.join('')
  assert.deepEqual(splitTtsSegments(text), sentences)
  assert.equal(firstTtsSegment(text), sentences[0])
  assert.equal(applyTtsPlaybackScope(text, 'first-segment', true), sentences[0])
})

test('ends Smart playback at the whole sentence before adding a closing cue', () => {
  const first = `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`
  const text = prepareTtsText(first + `${'乙'.repeat(600)}。`)
  const result = applyTtsPlaybackScope(text, 'smart', true, () => 0)
  assert.equal(result, `${prepareTtsText(first)}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
})

test('adds the Smart closing cue when resumed live playback reaches completion', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const first = `${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`
  const partial = prepareTtsText(first + `${'乙'.repeat(40)}`)
  const final = prepareTtsText(first + `${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)

  const checkpoint = applyTtsLivePlaybackScope(partial, 'smart', limiter)
  assert.equal(checkpoint, prepareTtsText(first))
  assert.equal(
    applyTtsLivePlaybackScope(final, 'smart', limiter, true, () => 0),
    `${prepareTtsText(first)}${TTS_SMART_TRUNCATION_OUTROS[0]}`,
  )
})

test('ends a chunk before the next sentence when combining them exceeds the preferred maximum', () => {
  const first = `${'甲'.repeat(100)}。`
  const next = `${'乙'.repeat(200)}。`
  assert.deepEqual(splitTtsSegments(first + next), [first, next].map(prepareTtsText))
  assert.equal(firstTtsSegment(first + next), prepareTtsText(first))
})

test('does not lock streaming playback inside a sentence after reaching the target length', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const first = `${'甲'.repeat(100)}。`
  const next = `${'乙'.repeat(100)}。`
  assert.equal(limiter.limit(first), prepareTtsText(first))
  assert.equal(limiter.limit(first + next.slice(0, 80)), prepareTtsText(first))
  const whole = prepareTtsText(first + next)
  assert.equal(limiter.limit(first + next), whole)
  assert.equal(limiter.limit(first + next + '后续内容。', true), whole)
})

test('waits for the end of a long streaming sentence and then keeps it whole', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const sentence = `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`
  for (const size of [DEFAULT_TTS_SEGMENT_CHARACTERS, MAX_TTS_SEGMENT_CHARACTERS, sentence.length - 1]) {
    assert.equal(limiter.limit(sentence.slice(0, size)), '')
  }
  assert.equal(limiter.limit(sentence), prepareTtsText(sentence))
  assert.equal(limiter.limit(sentence + '后续内容。', true), prepareTtsText(sentence))
})

test('flushes an unterminated final sentence without hard cutting it', () => {
  const text = '甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)
  const limiter = new TtsFirstSegmentLimiter()
  assert.equal(limiter.limit(text), '')
  assert.equal(limiter.limit(text, true), text)
  assert.deepEqual(splitTtsSegments(text), [text])
})

test('recognizes normalized and English sentence ends without splitting decimal numbers', () => {
  for (const first of ['数值是3.14。', 'Value is 3.14. ']) {
    const limiter = new TtsFirstSegmentLimiter()
    assert.equal(limiter.limit(`${first}下一句尚未完成`), prepareTtsText(first))
  }
  const first = `${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}3.14。`
  assert.equal(firstTtsSegment(first + '下一句。'.repeat(50)), prepareTtsText(first))
  const limiter = new TtsFirstSegmentLimiter()
  assert.equal(limiter.limit(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}3.`), '')
  assert.equal(limiter.limit(first + '下一句尚未完成'), prepareTtsText(first))
})
