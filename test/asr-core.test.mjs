import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AsrDraftWriter,
  LinearResampler,
  MAX_ASR_FRAMES,
  asrDeltaFromSse,
  asrDeltasFromChunk,
  encodeWavPcm16Mono,
  floatToPcm16Bytes,
  joinAsrDraft,
  normalizeAsrLevel,
  PcmRecorder,
} from '../lib/asr-core.js'
import { validateAsrWav } from '../lib/asr-host.js'
import { ASR_SAMPLE_RATE } from '../lib/shared.js'

function sineWave(rate, hz, frames, amplitude = 0.5, phase = 0) {
  const samples = new Float32Array(frames)
  for (let index = 0; index < frames; index++) {
    samples[index] = amplitude * Math.sin(2 * Math.PI * hz * (index + phase) / rate)
  }
  return samples
}

test('linear resampler emits every step-th sample and matches whole-buffer output', () => {
  const source = sineWave(48000, 440, 4800)
  const whole = new LinearResampler(48000).push(source)
  assert.equal(whole.length, Math.ceil(4800 / 3))
  // 48 kHz → 16 kHz keeps one of every three samples at the same phase points.
  assert.ok(Math.abs(whole[1] - source[3]) < 1e-6)
  assert.ok(Math.abs(whole[2] - source[6]) < 1e-6)

  const resampler = new LinearResampler(48000)
  const chunked = []
  for (let offset = 0; offset < source.length; offset += 1024) {
    chunked.push(...resampler.push(source.subarray(offset, Math.min(offset + 1024, source.length))))
  }
  assert.equal(chunked.length, whole.length)
  for (let index = 0; index < whole.length; index++) {
    assert.ok(Math.abs(chunked[index] - whole[index]) < 1e-9, `chunked output diverges at ${index}`)
  }
})

test('linear resampler handles non-integer ratios and restarts cleanly', () => {
  const resampler = new LinearResampler(44100)
  const first = resampler.push(sineWave(44100, 440, 4410))
  const second = resampler.push(sineWave(44100, 440, 4410, 0.5, 4410))
  assert.equal(first.length, 1600)
  assert.equal(second.length, 1600)
  resampler.reset()
  const restarted = resampler.push(sineWave(44100, 440, 100))
  assert.ok(restarted.length > 0)
  assert.ok(Math.abs(restarted[0] - 0) < 1e-9)
})

test('WAV encoding writes a canonical 44-byte PCM16 mono header', () => {
  const pcm = Int16Array.from([0, 16384, -16384, 32767, -32768])
  const wav = encodeWavPcm16Mono(pcm, ASR_SAMPLE_RATE)
  assert.equal(wav.byteLength, 44 + pcm.length * 2)
  assert.equal(Buffer.from(wav.buffer, 0, 4).toString('ascii'), 'RIFF')
  assert.equal(Buffer.from(wav.buffer, 8, 4).toString('ascii'), 'WAVE')
  const view = new DataView(wav.buffer)
  assert.equal(view.getUint32(4, true), 36 + pcm.length * 2)
  assert.equal(view.getUint32(16, true), 16)
  assert.equal(view.getUint16(20, true), 1)
  assert.equal(view.getUint16(22, true), 1)
  assert.equal(view.getUint32(24, true), ASR_SAMPLE_RATE)
  assert.equal(view.getUint32(28, true), ASR_SAMPLE_RATE * 2)
  assert.equal(view.getUint16(32, true), 2)
  assert.equal(view.getUint16(34, true), 16)
  assert.equal(Buffer.from(wav.buffer, 36, 4).toString('ascii'), 'data')
  assert.equal(view.getUint32(40, true), pcm.length * 2)
  assert.equal(view.getInt16(48, true), -16384)

  assert.equal(validateAsrWav(wav).frames, pcm.length)
})

test('WAV validation rejects wrong container, codec, channels, rate, and length', () => {
  const pcm = Int16Array.from([0, 1, 2, 3])
  const wav = encodeWavPcm16Mono(pcm)

  assert.equal(validateAsrWav(new Uint8Array(10)), 'invalid-wav')
  const tampered = wav.slice()
  tampered[0] = 0x58
  assert.equal(validateAsrWav(tampered), 'invalid-wav')

  const notPcm = wav.slice()
  new DataView(notPcm.buffer).setUint16(20, 3, true) // IEEE float
  assert.equal(validateAsrWav(notPcm), 'wav-not-pcm16')

  const stereo = wav.slice()
  new DataView(stereo.buffer).setUint16(22, 2, true)
  assert.equal(validateAsrWav(stereo), 'wav-channels-unsupported')

  const wrongRate = wav.slice()
  new DataView(wrongRate.buffer).setUint32(24, 44100, true)
  assert.equal(validateAsrWav(wrongRate), 'wav-sample-rate-unsupported')

  const longPcm = new Int16Array(ASR_SAMPLE_RATE * 120 + 1)
  const tooLong = encodeWavPcm16Mono(longPcm)
  assert.equal(validateAsrWav(tooLong), 'wav-too-long')

  const exactPcm = new Int16Array(ASR_SAMPLE_RATE * 120)
  assert.equal(validateAsrWav(encodeWavPcm16Mono(exactPcm)).frames, MAX_ASR_FRAMES)

  // Chunk order and extra chunks stay acceptable.
  const chunked = new Uint8Array(56 + pcm.length * 2)
  const view = new DataView(chunked.buffer)
  const writer = (offset, text) => Buffer.from(chunked.buffer, offset, text.length).write(text, 'ascii')
  writer(0, 'RIFF')
  view.setUint32(4, chunked.byteLength - 8, true)
  writer(8, 'WAVE')
  writer(12, 'LIST')
  view.setUint32(16, 4, true)
  chunked.set([1, 2, 3, 4], 20)
  writer(24, 'fmt ')
  view.setUint32(28, 16, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 1, true)
  view.setUint32(36, ASR_SAMPLE_RATE, true)
  view.setUint32(40, ASR_SAMPLE_RATE * 2, true)
  view.setUint16(44, 2, true)
  view.setUint16(46, 16, true)
  writer(48, 'data')
  view.setUint32(52, pcm.length * 2, true)
  chunked.set(new Uint8Array(pcm.buffer, 0, pcm.length * 2), 56)
  assert.equal(validateAsrWav(chunked).frames, pcm.length)
})

test('PcmRecorder hard-stops at 120 seconds of actual output frames', () => {
  const recorder = new PcmRecorder()
  const chunk = new Float32Array(1600).fill(0.25)
  let pushes = 0
  while (!recorder.limitReached && pushes < 50000) {
    recorder.push(chunk)
    pushes += 1
  }
  assert.equal(recorder.frameCount, MAX_ASR_FRAMES)
  assert.equal(recorder.frameCount, ASR_SAMPLE_RATE * 120)
  const before = recorder.frameCount
  recorder.push(chunk)
  assert.equal(recorder.frameCount, before)

  const wav = recorder.toWav()
  assert.ok(wav.byteLength <= 4 * 1024 * 1024)
  assert.equal(validateAsrWav(wav).frames, MAX_ASR_FRAMES)

  recorder.clear()
  assert.equal(recorder.frameCount, 0)
  assert.equal(recorder.toWav().byteLength, 44)
})

test('level normalization maps silence to zero and clamps loud input', () => {
  assert.equal(normalizeAsrLevel(0), 0)
  assert.equal(normalizeAsrLevel(Number.NaN), 0)
  assert.equal(normalizeAsrLevel(-1), 0)
  const quiet = normalizeAsrLevel(0.01)
  assert.ok(quiet > 0 && quiet < 0.2)
  assert.equal(normalizeAsrLevel(0.5), 1)
  assert.equal(normalizeAsrLevel(2), 1)
  const sine = new Float32Array(100)
  for (let index = 0; index < sine.length; index++) sine[index] = Math.sin(2 * Math.PI * 440 * index / ASR_SAMPLE_RATE)
  const blockRms = Math.sqrt(sine.reduce((sum, value) => sum + value * value, 0) / sine.length)
  assert.ok(Math.abs(blockRms - 0.707) < 0.01)
  assert.equal(normalizeAsrLevel(blockRms), 1)
})

test('PCM16 conversion clamps into the 16-bit range', () => {
  const bytes = floatToPcm16Bytes(Float32Array.from([-2, -1, -0.5, 0, 0.5, 1, 2]))
  const view = new DataView(bytes.buffer)
  assert.equal(view.getInt16(0, true), -32767)
  assert.equal(view.getInt16(2, true), -32767)
  assert.equal(view.getInt16(4, true), Math.round(-0.5 * 32767))
  assert.equal(view.getInt16(6, true), 0)
  assert.equal(view.getInt16(8, true), Math.round(0.5 * 32767))
  assert.equal(view.getInt16(10, true), 32767)
  assert.equal(view.getInt16(12, true), 32767)
})

test('ASR SSE delta extraction handles split records, content deltas, and [DONE]', () => {
  assert.equal(asrDeltaFromSse('[DONE]'), null)
  assert.equal(asrDeltaFromSse(JSON.stringify({ choices: [{ delta: { content: '你好' } }] })), '你好')
  assert.equal(asrDeltaFromSse(JSON.stringify({ choices: [{ delta: {} }] })), null)
  assert.throws(() => asrDeltaFromSse(JSON.stringify({ error: { message: 'quota-exceeded' } })), /quota-exceeded/)

  const event = `data: ${JSON.stringify({ choices: [{ delta: { content: '世界' } }] })}\n\n`
  const first = asrDeltasFromChunk(event.slice(0, 20))
  assert.deepEqual(first.deltas, [])
  assert.ok(first.remainder.length > 0)
  const rest = `data: ${JSON.stringify({ choices: [{ delta: { content: '！' } }] })}\n\ndata: [DONE]\n\n`
  const second = asrDeltasFromChunk(first.remainder + event.slice(20) + rest)
  assert.deepEqual(second.deltas, ['世界', '！'])
})

test('draft merging joins with a single newline for non-empty drafts', () => {
  assert.equal(joinAsrDraft('', '你好'), '你好')
  assert.equal(joinAsrDraft('已有草稿', '你好'), '已有草稿\n你好')
  assert.equal(joinAsrDraft('已有草稿', ''), '已有草稿')
})

test('AsrDraftWriter defers writes until the throttle tick or final flush', () => {
  let draft = ''
  const writer = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 5)
  writer.setText('你好')
  assert.equal(draft, '', 'no synchronous write before the tick or flush')
  writer.flush(true)
  assert.equal(draft, '你好')
  writer.dispose()
})

test('AsrDraftWriter writes throttled partials and appends to a non-empty base draft', async () => {
  let draft = '在吗'
  const writer = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 10)
  writer.setText('你好')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(draft, '在吗\n你好')
  writer.setText('你好世界')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(draft, '在吗\n你好世界')
  writer.flush(true)
  writer.dispose()
  assert.equal(draft, '在吗\n你好世界')
})

test('AsrDraftWriter keeps user edits during streaming and appends the full transcript at completion', async () => {
  let draft = ''
  const writer = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 10)
  writer.setText('你好')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(draft, '你好')
  assert.equal(writer.userEditedDuringStream, false)

  draft = '你好！我自己写一句'
  writer.setText('你好世界')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(draft, '你好！我自己写一句', 'user edit must not be overwritten')
  assert.equal(writer.userEditedDuringStream, true)

  writer.flush(true)
  assert.equal(draft, '你好！我自己写一句\n你好世界')
  writer.dispose()
})

test('AsrDraftWriter detects an edit that lands before the first write', () => {
  let draft = ''
  const writer = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 10)
  draft = '用户抢先输入'
  writer.setText('转写完成')
  writer.flush(true)
  assert.equal(draft, '用户抢先输入\n转写完成')
  assert.equal(writer.userEditedDuringStream, true)
})

test('AsrDraftWriter ignores empty transcripts and stopped writers', async () => {
  let draft = ''
  const writer = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 5)
  writer.setText('')
  await new Promise((resolve) => setTimeout(resolve, 20))
  writer.flush(true)
  assert.equal(draft, '')

  const stopped = new AsrDraftWriter({ getDraft: () => draft, setDraft: (text) => { draft = text } }, 5)
  stopped.dispose()
  stopped.setText('不应写入')
  await new Promise((resolve) => setTimeout(resolve, 20))
  stopped.flush(true)
  assert.equal(draft, '')
})
