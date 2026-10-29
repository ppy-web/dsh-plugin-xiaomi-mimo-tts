import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTtsSettings, prepareTtsText } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'

const { DuplexPcmStream } = await loadClientModule('src/client/playback/duplex-pcm.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { RealtimeSpeechSession } = await loadClientModule('src/client/playback/realtime-speech-session.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const selection = { provider: 'doubao', model: 'seed-tts-2.0', voice: 'test-voice' }
const settings = extra => resolveTtsSettings({ provider: 'doubao', doubaoVoice: 'test-voice', ...extra })
const final = (text, step = 0) => ({ turn: 1, step, text, messageId: `message-${step}`, interrupted: false })

test('duplex consumer queues text before ready and joins split PCM samples without losing bytes', async () => {
  await withDuplexBrowser(async sockets => {
    const chunks = []
    const stream = new DuplexPcmStream(selection, new AbortController().signal, bytes => chunks.push(...bytes))
    stream.append('第一句')
    stream.append('第二句')
    await stream.finish()
    assert.deepEqual(chunks, [1, 2, 3, 1, 2, 3])
    assert.deepEqual(sockets[0].sent.map(command => command.type), ['start', 'text', 'text', 'finish'])
    assert.equal(sockets[0].sent[0].selection.provider, 'doubao')
  }, { handle(socket, command) { if (command.type === 'text') { socket.audio([1, 2, 3]); return true } } })
})

test('duplex connects to the desktop Host or the browser document deployment base', async () => {
  const names = ['document', 'location', '__DSH_TRANSPORT__']
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
  try {
    for (const [baseURI, href, transport, expected] of [
      [undefined, undefined, undefined, 'ws://localhost/plugins/xiaomi-mimo-tts/synthesize-duplex'],
      ['https://example.test/', 'https://example.test/chat', undefined, 'wss://example.test/plugins/xiaomi-mimo-tts/synthesize-duplex'],
      ['https://example.test/tools/dsh/', 'https://example.test/tools/dsh/chat/session', undefined, 'wss://example.test/tools/dsh/plugins/xiaomi-mimo-tts/synthesize-duplex'],
      ['dsh-app://app/', 'dsh-app://app/', { streamBaseUrl: 'http://127.0.0.1:54321' }, 'ws://127.0.0.1:54321/plugins/xiaomi-mimo-tts/synthesize-duplex'],
      ['dsh-app://app/', 'dsh-app://app/chat/session', { streamBaseUrl: 'https://127.0.0.1:54321' }, 'wss://127.0.0.1:54321/plugins/xiaomi-mimo-tts/synthesize-duplex'],
    ]) {
      for (const [index, value] of [baseURI && { baseURI }, href && { href }, transport].entries()) {
        Object.defineProperty(globalThis, names[index], { configurable: true, writable: true, value })
      }
      await withDuplexBrowser(async sockets => {
        const chunks = []
        const stream = new DuplexPcmStream(selection, new AbortController().signal, bytes => chunks.push(...bytes))
        stream.append('桌面语音测试。')
        await stream.finish()
        assert.equal(sockets[0].url, expected)
        assert.deepEqual(chunks, [0, 0, 1, 0])
      })
    }
  } finally {
    for (const [index, name] of names.entries()) {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index])
      else delete globalThis[name]
    }
  }
})

test('duplex rejects odd terminal PCM samples and unexpected close', async () => {
  await withDuplexBrowser(async () => {
    const stream = new DuplexPcmStream(selection, new AbortController().signal, () => {})
    stream.append('text')
    await assert.rejects(stream.finish(), error => error.code === 'invalid-pcm-sample')
  }, { handle(socket, command) { if (command.type === 'text') { socket.audio([1]); return true } } })
  await withDuplexBrowser(async () => {
    const stream = new DuplexPcmStream(selection, new AbortController().signal, () => {})
    stream.append('text')
    await assert.rejects(stream.finish(), error => error.code === 'stream-connection-closed')
  }, { handle(socket, command) { if (command.type === 'text') { socket.drop(); return true } } })
})

test('duplex input cancellation and slow-consumer limits discard queued late audio', async () => {
  await withDuplexBrowser(async sockets => {
    const controller = new AbortController()
    let consumed = 0
    const stream = new DuplexPcmStream(selection, controller.signal, () => { consumed += 1 })
    controller.abort()
    await assert.rejects(stream.done, error => error.name === 'AbortError')
    assert.equal(consumed, 0)
    assert.equal(sockets[0].closed, true)
  })
  await withDuplexBrowser(async () => {
    const stream = new DuplexPcmStream(selection, new AbortController().signal, () => {}, 2)
    stream.append('text')
    await assert.rejects(stream.finish(), error => error.code === 'stream-buffer-limit')
  })
})

async function withLive(run, options = {}) {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const saved = []
    const live = new LiveSpeechController({ add: entry => saved.push(entry) })
    live.configure(settings())
    live.activateSession('session')
    try { await run({ live, sockets, saved, state }) } finally { await live.dispose() }
  }, options), { endPcm: true })
}

test('one live message uses one duplex session, plays early and saves one complete recording', async () => {
  await withLive(async ({ live, sockets, saved, state }) => {
    live.observe('session', 1, 0, '你好。')
    await settle()
    assert.equal(sockets.length, 1)
    assert.equal(state.contexts[0].sources.length, 1)
    assert.equal(sockets[0].sent.some(command => command.type === 'finish'), false)
    live.observe('session', 1, 0, '你好。世界。')
    live.finish('session', final('你好。世界。最后一句'))
    await settle()
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].sent.filter(command => command.type === 'text').map(command => command.text).join(''), prepareTtsText('你好。世界。最后一句'))
    assert.equal(saved.length, 1)
    assert.equal(saved[0].text, prepareTtsText('你好。世界。最后一句'))
    assert.equal(saved[0].messageId, 'message-0')
    const wav = new DataView(await saved[0].blob.arrayBuffer())
    assert.equal(wav.getUint32(40, true), 12)
  })
})

test('early duplex speech owns the reply before its final identity arrives, including after cancellation', async () => {
  await withLive(async ({ live, sockets, state }) => {
    const text = '这是已经开始朗读的正文。'
    live.observe('session', 1, 0, text)
    await settle()
    assert.equal(state.contexts[0].sources.length, 1)
    assert.equal(live.hasHandled('session', final(text)), true, 'completed autoplay must not restart a reply already streaming')
    assert.equal(live.hasHandled('session', final('下一步的回复。', 1)), false)

    // The running/session snapshot may settle before the durable message arrives.
    live.cancelSession('session')
    live.finish('session', final(text))
    assert.equal(live.hasHandled('session', final(text)), true)
    await settle()
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].sent.filter(command => command.type === 'text').map(command => command.text).join(''), prepareTtsText(text))

    // The automatic deduplication marker must still allow an explicit replay.
    live.playCompleted('session', 'message-0', text, () => assert.fail('unexpected fallback'))
    await settle()
    assert.equal(sockets.length, 2)
  })
})

test('unspoken duplex text leaves completed autoplay eligible', async () => {
  await withLive(async ({ live, sockets }) => {
    for (const text of ['', '尚未说完', '```js\nconst value = 1\n```']) {
      live.observe('session', 1, 0, text)
      assert.equal(live.hasHandled('session', final(text)), false)
    }
    await settle()
    assert.equal(sockets.length, 0)
  })
})

test('successive steps use ordered independent duplex jobs without mixing audio', async () => {
  await withLive(async ({ live, sockets, saved }) => {
    live.observe('session', 1, 0, '第一条。')
    await settle()
    live.finish('session', final('第一条。'))
    live.observe('session', 1, 1, '第二条。')
    live.finish('session', final('第二条。', 1))
    await settle()
    await settle()
    assert.equal(sockets.length, 2)
    assert.deepEqual(saved.map(entry => entry.messageId), ['message-0', 'message-1'])
    assert.deepEqual(saved.map(entry => entry.text), [prepareTtsText('第一条。'), prepareTtsText('第二条。')])
  })
})

test('pure code never creates a duplex session, and stop prevents late recordings', async () => {
  await withLive(async ({ live, sockets, saved }) => {
    live.observe('session', 1, 0, '```js\nconst a = 1\n```')
    live.finish('session', final('```js\nconst a = 1\n```'))
    await settle()
    assert.equal(sockets.length, 0)
    live.observe('session', 2, 0, '新的文字。')
    await settle()
    assert.equal(live.stop('session'), true)
    sockets[0].audio()
    await settle()
    assert.equal(saved.length, 0)
    assert.equal(sockets[0].closed, true)
  }, { handle(_socket, command) { return command.type === 'text' } })
})

test('changing provider cancels the old job and suppresses automatic replay of that turn', async () => {
  await withLive(async ({ live, sockets, saved }) => {
    live.observe('session', 1, 0, '第一句。')
    await settle()
    live.configure(resolveTtsSettings())
    live.observe('session', 1, 0, '第一句。还有一句。')
    await settle()
    assert.equal(sockets[0].closed, true)
    assert.equal(sockets.length, 1)
    assert.equal(saved.length, 0)
  })
})

test('changing a saved instruction cancels the active reply without replay and applies to the next reply', async () => {
  await withLive(async ({ live, sockets }) => {
    live.configure(settings({ doubaoInstruction: 'first delivery' }))
    live.observe('session', 1, 0, '第一句。')
    await settle()
    assert.equal(sockets[0].sent[0].selection.speechInstruction, 'first delivery')
    live.configure(settings({ doubaoInstruction: 'new delivery' }))
    assert.equal(sockets[0].closed, true)
    live.observe('session', 1, 0, '第一句。后续内容。')
    await settle()
    assert.equal(sockets.length, 1)
    live.observe('session', 2, 0, '新的回复。')
    await settle()
    assert.equal(sockets[1].sent[0].selection.speechInstruction, 'new delivery')
  })
})

test('settings preview sends an unsaved instruction and an explicit empty override', async () => {
  await withBrowserPlayback(async () => withDuplexBrowser(async sockets => {
    const preview = new PreviewPlayer(() => {})
    try {
      await preview.play('试听文本。', settings({ doubaoInstruction: 'draft delivery', localSpeechMode: 'disabled' }))
      assert.equal(sockets[0].sent[0].selection.speechInstruction, 'draft delivery')
      await preview.play('自然表达。', settings({ doubaoInstruction: '', localSpeechMode: 'disabled' }))
      assert.equal(sockets[1].sent[0].selection.speechInstruction, '')
    } finally { await preview.dispose() }
  }), { endPcm: true })
})

test('bounded duplex read scopes finish input while generation is still running', async () => {
  await withLive(async ({ live, sockets }) => {
    const local = new LocalSpeechController()
    const speech = new RealtimeSpeechSession(live, local)
    speech.configure({ localSpeechMode: 'disabled', apiKeySupported: true, readScope: 'first-segment' })
    speech.activate('session')
    const text = '甲'.repeat(160) + '。' + '后面内容。'.repeat(60)
    speech.observe('session', 1, 0, text)
    await settle()
    assert.equal(sockets[0].sent.filter(command => command.type === 'finish').length, 1)
    speech.finish('session', final(text + '最后还有文字。'))
    await settle()
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].sent.filter(command => command.type === 'finish').length, 1)
    speech.deactivate('session')
    local.dispose()
  })
})

test('failure before playback falls back once, but failure after playback never replays', async () => {
  await withLive(async ({ live }) => {
    let fallback = 0
    live.setFallbackHandler(() => { fallback += 1 })
    live.observe('session', 1, 0, '一句话。')
    await settle()
    assert.equal(fallback, 1)
  }, { handle(socket, command) { if (command.type === 'text') { socket.message({ type: 'error', error: 'rate-limited' }); return true } } })
  await withLive(async ({ live, sockets }) => {
    let fallback = 0
    live.setFallbackHandler(() => { fallback += 1 })
    live.observe('session', 1, 0, '一句话。')
    await settle()
    sockets[0].message({ type: 'error', error: 'rate-limited' })
    await settle()
    assert.equal(fallback, 0)
  })
})
