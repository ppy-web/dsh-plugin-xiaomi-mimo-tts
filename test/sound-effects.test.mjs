import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const shared = await import('../lib/shared.js')
const clickClassifier = await readFile(new URL('../src/client/sound-effects/click-classifier.ts', import.meta.url), 'utf8')
const taskWatcher = await readFile(new URL('../src/client/sound-effects/task-watcher.ts', import.meta.url), 'utf8')
const soundIndex = await readFile(new URL('../src/client/sound-effects/index.ts', import.meta.url), 'utf8')
const soundSettings = await readFile(new URL('../src/client/sound-effects/settings-card.tsx', import.meta.url), 'utf8')
const clientEntry = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const pcmQueue = await readFile(new URL('../src/client/pcm-audio-queue.ts', import.meta.url), 'utf8')
const playback = await readFile(new URL('../src/client/playback-controller.ts', import.meta.url), 'utf8')
const previewPlayer = await readFile(new URL('../src/client/preview-player.ts', import.meta.url), 'utf8')
const localSpeech = await readFile(new URL('../src/client/local-speech-controller.ts', import.meta.url), 'utf8')
const settingsCard = await readFile(new URL('../src/client/settings-card.tsx', import.meta.url), 'utf8')
const energySlider = await readFile(new URL('../src/client/energy-volume-slider.tsx', import.meta.url), 'utf8')
const toggleSound = await readFile(new URL('../src/client/toggle-sound-player.ts', import.meta.url), 'utf8')

test('sound effects expose migrated packs and safe defaults', () => {
  assert.deepEqual(shared.SOUND_PACKS, ['minimal', 'soft', 'glass', 'arcade', 'mechanical', 'organic', 'dreamy', 'scifi', 'rubber', 'cinematic', 'studio', 'zen'])
  assert.equal(shared.DEFAULT_TTS_SETTINGS.soundEnabled, true)
  assert.equal(shared.DEFAULT_TTS_SETTINGS.soundVolume, 0.35)
  assert.equal(shared.DEFAULT_TTS_SETTINGS.soundPack, 'zen')
})

test('click classification covers semantic controls and disabled controls', () => {
  assert.match(clickClassifier, /button, a, \[role='button'\], \[role='switch'\], \[role='checkbox'\]/)
  assert.match(clickClassifier, /element\.disabled/)
  assert.match(clickClassifier, /return 'send'/)
  assert.match(clickClassifier, /return 'delete'/)
  assert.match(clickClassifier, /return 'toggle-on'/)
  assert.match(clickClassifier, /return 'open'/)
})

test('task watcher implements current-session lifecycle boundaries and cleanup', () => {
  assert.match(clientEntry, /'sessions'/)
  assert.match(taskWatcher, /running && !lastRunning/)
  assert.match(taskWatcher, /lastAgentError != null \|\| hasTurnError\(\)/)
  assert.match(taskWatcher, /pending > lastPending/)
  assert.match(taskWatcher, /sessions\.list\.subscribe/)
  assert.match(taskWatcher, /window\.clearTimeout\(retryTimer\)/)
  assert.match(taskWatcher, /unbind\(\)/)
})

test('sound controller is local-only and disposes the Web Audio player', () => {
  assert.doesNotMatch(soundIndex, /fetch\(/)
  assert.match(soundIndex, /createUISFX\(/)
  assert.match(soundIndex, /await current\.destroy\(\)/)
  assert.match(soundIndex, /document\.addEventListener\('pointerdown'/)
})

test('sound settings keep task and click behavior synchronized with the master switch', () => {
  assert.match(soundSettings, /await scope\.set\('soundEnabled', enabled\)/)
  assert.match(soundSettings, /await scope\.set\('taskSounds', enabled\)/)
  assert.match(soundSettings, /await scope\.set\('clickSounds', enabled\)/)
  assert.match(clientEntry, /taskSounds: resolved\.soundEnabled/)
  assert.match(clientEntry, /clickSounds: resolved\.soundEnabled/)
  assert.match(soundSettings, /aria-pressed=\{sound\.enabled\}/)
  assert.match(soundSettings, /onClick=\{\(\) => \{ void setEnabled\(!sound\.enabled\) \}\}/)
  assert.match(soundSettings, /\{ cue: 'press', position: '100%' \}/)
  assert.match(clickClassifier, /data-xmimo-sound-preview/)
})

test('voice volume is clamped, persisted, and reaches every generated-audio playback path', () => {
  assert.equal(shared.DEFAULT_TTS_SETTINGS.voiceVolume, 1)
  assert.equal(shared.resolveTtsSettings({ voiceVolume: -1 }).voiceVolume, 0)
  assert.equal(shared.resolveTtsSettings({ voiceVolume: 2 }).voiceVolume, 1)
  assert.match(settingsCard, /'voiceVolume'/)
  assert.match(settingsCard, /<EnergyVolumeSlider value=\{voiceVolume\}/)
  assert.match(pcmQueue, /source\.connect\(this\.getGain\(context\)\)/)
  assert.match(pcmQueue, /linearRampToValueAtTime\(this\.volume, now \+ \.02\)/)
  assert.match(playback, /audio\.volume = this\.volume/)
  assert.match(previewPlayer, /this\.pcm\.setVolume\(this\.volume\)/)
  assert.match(localSpeech, /utterance\.volume = this\.volume/)
  assert.match(clientEntry, /updateVoiceVolume/)
  assert.match(energySlider, /data-high=\{normalized > \.85\}/)
  assert.match(toggleSound, /setVolume\(value: number\)/)
  assert.match(toggleSound, /if \(this\.audio !== null\) this\.audio\.volume = this\.volume/)
  assert.match(toggleSound, /audio\.volume = this\.volume/)
})
