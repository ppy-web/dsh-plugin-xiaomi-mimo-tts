import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SEGMENT_CHARACTERS, resolveTtsSettings, ttsSelection } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { synthesisOptions } = await loadClientModule('src/host/validation.ts')
const { requestMessages } = await loadClientModule('src/host/synthesis.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')

for (const model of ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign']) {
  test(`${model} applies saved, draft and cleared instructions without mixing in another provider's style`, () => {
    const saved = resolveTtsSettings({ model, presetStylePrompt: 'preset context', voiceDesignPrompt: 'voice description', instruction: 'saved delivery', doubaoInstruction: 'Doubao delivery' })
    const cases = model.endsWith('voicedesign')
      ? [[{}, 'saved delivery', 'voice description\nsaved delivery'], [{ speechInstruction: '  draft delivery  ' }, 'draft delivery', 'voice description\ndraft delivery'], [{ speechInstruction: '' }, '', 'voice description']]
      : [[{}, 'saved delivery', 'saved delivery'], [{ speechInstruction: '  draft delivery  ' }, 'draft delivery', 'draft delivery'], [{ speechInstruction: '' }, '', 'preset context']]
    for (const [body, delivery, context] of cases) {
      const selected = synthesisOptions(saved, body)
      assert.deepEqual(requestMessages(selected, '只朗读这句话。'), [
        { role: 'user', content: context },
        { role: 'assistant', content: '只朗读这句话。' },
      ])
      assert.equal(ttsSelection(selected).speechInstruction, delivery)
      assert.equal(selected.doubaoInstruction, 'Doubao delivery')
    }
    assert.equal(saved.instruction, 'saved delivery')
    for (const invalid of [null, 4, [], {}, true]) {
      assert.throws(() => synthesisOptions(saved, { speechInstruction: invalid }), error => error.code === 'invalid-speech-instruction')
    }
  })
}

test('Xiaomi built-in voices add no default style and accept both empty style fields', () => {
  const text = '忠实保留待朗读的文字。'
  assert.deepEqual(requestMessages(resolveTtsSettings(), text), [{ role: 'assistant', content: text }])
  assert.deepEqual(requestMessages(resolveTtsSettings({ instruction: '  ', presetStylePrompt: '\n ' }), text), [{ role: 'assistant', content: text }])
})

test('an explicit Xiaomi style replaces a conflicting saved preset style without changing saved settings', () => {
  const saved = resolveTtsSettings({ presetStylePrompt: '平和克制，避免夸张', instruction: '' })
  const selected = synthesisOptions(saved, { speechInstruction: '  愤怒地争辩  ' })
  assert.deepEqual(requestMessages(selected, '台词。'), [
    { role: 'user', content: '愤怒地争辩' },
    { role: 'assistant', content: '台词。' },
  ])
  assert.equal(saved.instruction, '')
  assert.equal(saved.presetStylePrompt, '平和克制，避免夸张')
})

test('Xiaomi preview sends draft and explicit empty instructions for streamed, complete and segmented audio', async () => {
  await withBrowserPlayback(async state => {
    const player = new PreviewPlayer(() => {})
    try {
      for (const model of ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign']) {
        for (const instruction of ['draft delivery', '']) {
          const start = state.requests.length
          const text = model.endsWith('voicedesign') ? '甲'.repeat(200) + '。' + '乙'.repeat(200) + '。' : '试听。'
          const playing = player.play(text, resolveTtsSettings({ model, instruction, localSpeechMode: 'disabled' }))
          await settle()
          if (model.endsWith('voicedesign')) {
            state.media.at(-1).onended()
            await settle()
            state.media.at(-1).onended()
          }
          await playing
          const requests = state.requests.slice(start)
          assert.equal(requests.length, model.endsWith('voicedesign') ? 2 : 1)
          assert.ok(requests.every(request => request.speechInstruction === instruction))
        }
      }
      const playing = player.play('单句试听。', resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign', instruction: 'single delivery', localSpeechMode: 'disabled' }))
      await settle()
      state.media.at(-1).onended()
      await playing
      assert.equal(state.requests.at(-1).speechInstruction, 'single delivery')
      assert.equal(state.requests.at(-1).format, 'mp3')
    } finally { await player.dispose() }
  }, { endPcm: true })
})

test('changing Xiaomi instructions cancels the active reply and applies only to the next reply', async () => {
  let finishFirst
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const settings = instruction => resolveTtsSettings({ instruction, localSpeechMode: 'disabled' })
    live.configure(settings('first delivery'))
    live.activateSession('session')
    const text = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS + 10) + '。'
    try {
      live.observe('session', 1, 0, text)
      await settle()
      assert.equal(state.requests[0].speechInstruction, 'first delivery')
      live.configure(settings('next delivery'))
      assert.equal(state.requests[0].signal.aborted, true)
      finishFirst(new Response(pcmEvent()))
      live.observe('session', 1, 0, text + '后续内容。')
      await settle()
      assert.equal(state.requests.length, 1)
      live.observe('session', 2, 0, text)
      await settle()
      assert.equal(state.requests[1].speechInstruction, 'next delivery')
    } finally { await live.dispose() }
  }, { fetch: (_request, state) => state.requests.length === 1 ? new Promise(resolve => { finishFirst = resolve }) : new Response(pcmEvent()) })
})
