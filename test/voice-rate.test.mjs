import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyMediaVoiceRate,
  applyPcmVoiceRate,
  applySpeechVoiceRate,
  pcmPlaybackDuration,
} from '../src/client/playback/voice-rate.ts'

const shared = await import('../lib/shared.js')

test('voice rate defaults, clamps, and snaps to one decimal place', () => {
  assert.equal(shared.DEFAULT_TTS_SETTINGS.voiceRate, 1)
  assert.equal(shared.resolveTtsSettings({}).voiceRate, 1)
  assert.equal(shared.resolveTtsSettings({ voiceRate: Number.NaN }).voiceRate, 1)
  assert.equal(shared.resolveTtsSettings({ voiceRate: 0.1 }).voiceRate, 0.5)
  assert.equal(shared.resolveTtsSettings({ voiceRate: 1.26 }).voiceRate, 1.3)
  assert.equal(shared.resolveTtsSettings({ voiceRate: 4 }).voiceRate, 2)
})

test('voice rate configures browser speech and pitch-preserving media playback', () => {
  const media = { playbackRate: 1, preservesPitch: false }
  const utterance = { rate: 1 }

  applyMediaVoiceRate(media, 1.5)
  applySpeechVoiceRate(utterance, 0.8)

  assert.deepEqual(media, { playbackRate: 1.5, preservesPitch: true })
  assert.equal(utterance.rate, 0.8)
})

test('PCM voice rate configures the source and scales its scheduled duration', () => {
  const source = { playbackRate: { value: 1 } }

  applyPcmVoiceRate(source, 2)

  assert.equal(source.playbackRate.value, 2)
  assert.equal(pcmPlaybackDuration(1.2, 2), 0.6)
  assert.equal(pcmPlaybackDuration(1.2, 0.5), 2.4)
})
