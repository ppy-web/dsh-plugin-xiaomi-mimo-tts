import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { ASR_LANGUAGE, ASR_MODEL, ASR_SAMPLE_RATE, ASR_STREAM_ROUTE, DEFAULT_TTS_SETTINGS, TTS_VERSION } from '../lib/shared.js'
import { MAX_ASR_FRAMES } from '../lib/asr-core.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const asrCoreSource = await readFile(new URL('../src/asr-core.ts', import.meta.url), 'utf8')
const asrHostSource = await readFile(new URL('../src/asr-host.ts', import.meta.url), 'utf8')
const asrRecorderSource = await readFile(new URL('../src/client/asr-recorder.ts', import.meta.url), 'utf8')
const asrButtonSource = await readFile(new URL('../src/client/asr-button.tsx', import.meta.url), 'utf8')
const settingsCardSource = await readFile(new URL('../src/client/settings-card.tsx', import.meta.url), 'utf8')
const localizationSource = await readFile(new URL('../src/client/localization.ts', import.meta.url), 'utf8')
const clientIndexSource = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const stylesSource = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

test('package wires the ASR feature into the bundle, config, and version', () => {
  assert.equal(TTS_VERSION, packageJson.version)
  assert.match(patch, /asrEnabled: true/)
  assert.equal(DEFAULT_TTS_SETTINGS.asrEnabled, true)
  assert.match(host, /transcription route/)
  assert.equal(packageJson.dependencies?.gsap !== undefined, true)
  assert.equal(packageJson.dependencies?.['@gsap/react'] !== undefined, true)
  assert.match(client, /quickTo/)
})

test('client registers the dictation button at conversation.input.right', () => {
  assert.match(clientIndexSource, /'conversation\.input\.right'/)
  assert.match(clientIndexSource, /AsrDictationButton/)
  assert.match(clientIndexSource, /id: 'xiaomi-mimo-tts-asr'/)
})

test('recorder enforces the sample plan and worklet hygiene', () => {
  assert.equal(ASR_SAMPLE_RATE, 16000)
  assert.equal(MAX_ASR_FRAMES, 16000 * 120)
  assert.match(asrCoreSource, /ASR_WORKLET_SOURCE/)
  assert.match(asrCoreSource, /xmimo-asr-capture/)
  assert.match(asrRecorderSource, /getUserMedia/)
  assert.match(asrRecorderSource, /AudioWorkletNode/)
  assert.match(asrRecorderSource, /revokeObjectURL/)
  assert.match(asrRecorderSource, /track\.stop\(\)/)
  assert.match(asrRecorderSource, /context\.close\(\)/)
})

test('host route keeps the single-request contract and WAV guards', () => {
  assert.equal(ASR_MODEL, 'mimo-v2.5-asr')
  assert.equal(ASR_LANGUAGE, 'auto')
  assert.equal(ASR_STREAM_ROUTE, '/plugins/xiaomi-mimo-tts/transcribe-stream')
  assert.match(asrHostSource, /No retry is attempted|no retry/u)
  assert.match(asrHostSource, /data:audio\/wav;base64,/)
  assert.match(asrHostSource, /asr_options/)
  assert.match(asrHostSource, /stream: true/)
  assert.match(asrHostSource, /abortOnDisconnect/)
  assert.match(asrHostSource, /'audio\/wav'/)
})

test('button exposes accessible states and honors reduced motion', () => {
  assert.match(asrButtonSource, /aria-pressed/)
  assert.match(asrButtonSource, /aria-busy/)
  assert.match(asrButtonSource, /aria-label/)
  assert.match(asrButtonSource, /prefers-reduced-motion/)
  assert.match(asrButtonSource, /useGSAP/)
  assert.match(asrButtonSource, /quickTo/)
  assert.match(asrButtonSource, /setDraft/)
  assert.match(stylesSource, /prefers-reduced-motion/)
  assert.match(stylesSource, /xmimo-asr-glow/)
  assert.match(stylesSource, /xmimo-asr-halo/)
  assert.match(stylesSource, /conic-gradient/)
  assert.match(stylesSource, /radial-gradient/)
})

test('settings card owns an independent ASR toggle with localized copy', () => {
  assert.match(settingsCardSource, /asrEnabled/)
  assert.match(settingsCardSource, /changeAsrEnabled/)
  assert.match(localizationSource, /settings\.asrTitle/)
  assert.match(localizationSource, /asr\.start/)
  assert.match(localizationSource, /asr\.error\.permission/)
})

test('built client bundle embeds the worklet source and the ASR route', () => {
  assert.match(client, /xmimo-asr-capture/)
  assert.match(client, /transcribe-stream/)
  assert.match(client, /AudioWorklet/)
})
