import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { selectBrowserVoice } = await loadClientModule('src/client/browser-voice.ts')

test('browser voice selection preserves the chosen voice and fallback priority', () => {
  const voices = [
    { voiceURI: 'default', lang: 'en-US', default: true },
    { voiceURI: 'chinese', lang: 'zh-CN', default: false },
    { voiceURI: 'selected', lang: 'fr-FR', default: false },
  ]
  assert.equal(selectBrowserVoice(voices, 'selected'), voices[2])
  assert.equal(selectBrowserVoice(voices, 'missing'), voices[1])
  assert.equal(selectBrowserVoice([voices[0]], 'missing'), voices[0])
  assert.equal(selectBrowserVoice([], 'missing'), undefined)
})
