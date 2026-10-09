import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'tsdown'

const temp = await mkdtemp(resolve('.resume-test-'))
await build({ config: false, entry: 'src/client/playback/index.ts', outDir: temp, format: ['esm'], platform: 'node', target: 'es2024', dts: false, clean: false, noExternal: ['@deepseek-ai/dsh-client-ui-primitives'], alias: { '@deepseek-ai/dsh-client-ui-primitives': resolve('test/fixtures/plain-text.ts') } })
const { LiveSpeechController, LocalSpeechController, PlaybackController } = await import(pathToFileURL(resolve(temp, 'index.js')).href)
test.after(async () => {
  assert.ok(temp.startsWith(`${process.cwd()}${sep}`))
  await rm(temp, { recursive: true, force: true })
})

for (const Controller of [LiveSpeechController, LocalSpeechController]) {
  test(`${Controller.name} resumes with only text appended after reattachment`, () => {
    const speech = new Controller()
    speech.activateSession('one')
    speech.prime('one', 2, 0, '离开期间已经生成的正文。')
    const requests = []
    speech.queue.enqueue = (text) => requests.push(text)
    speech.observe('one', 2, 0, '离开期间已经生成的正文。返回后新增的第一句话。')
    speech.finish('one', { turn: 2, step: 0, messageId: 'reply', text: '离开期间已经生成的正文。返回后新增的第一句话。', interrupted: false })
    assert.deepEqual(requests, ['返回后新增的第一句话.'])
    speech.deactivateSession('one')
  })

  test(`${Controller.name} skips rewritten text and reads a later assistant step`, () => {
    const speech = new Controller()
    speech.activateSession('one')
    speech.prime('one', 2, 0, '原来的正文。')
    speech.observe('one', 2, 0, '改写后的正文。')
    const requests = []
    speech.queue.enqueue = (text) => requests.push(text)
    speech.observe('one', 2, 0, '改写后的正文。之后新增的内容。')
    speech.finish('one', { turn: 2, step: 0, messageId: 'first', text: '改写后的正文。之后新增的内容。', interrupted: false })
    speech.observe('one', 2, 1, '新步骤的内容。')
    speech.finish('one', { turn: 2, step: 1, messageId: 'second', text: '新步骤的内容。', interrupted: false })
    assert.deepEqual(requests, ['之后新增的内容.', '新步骤的内容.'])
    speech.deactivateSession('one')
  })

  test(`${Controller.name} starts from the latest checkpoint after multiple switches`, () => {
    const speech = new Controller()
    speech.activateSession('one')
    speech.prime('one', 2, 0, '第一次返回时的正文。')
    speech.deactivateSession('one')
    speech.activateSession('two')
    speech.deactivateSession('two')
    speech.activateSession('one')
    speech.prime('one', 2, 0, '第一次返回时的正文。第二次离开期间新增的正文。')
    const requests = []
    speech.queue.enqueue = (text) => requests.push(text)
    speech.observe('one', 2, 0, '第一次返回时的正文。第二次离开期间新增的正文。第二次返回后新增的正文。')
    speech.finish('one', { turn: 2, step: 0, messageId: 'reply', text: '第一次返回时的正文。第二次离开期间新增的正文。第二次返回后新增的正文。', interrupted: false })
    assert.deepEqual(requests, ['第二次返回后新增的正文.'])
    speech.deactivateSession('one')
  })

  test(`${Controller.name} keeps a manually stopped turn silent across session switches`, () => {
    const speech = new Controller()
    speech.activateSession('one')
    speech.prime('one', 2, 0, '')
    speech.stream = async () => new Promise(() => {})
    speech.speak = async () => new Promise(() => {})
    speech.observe('one', 2, 0, '这是一段足够长的正文，用来使语音请求进入加载状态。')
    assert.equal(speech.stop('one'), true)
    speech.deactivateSession('one')
    speech.activateSession('two')
    speech.deactivateSession('two')
    speech.activateSession('one')
    speech.prime('one', 2, 0, '当前已经生成的正文。')
    const requests = []
    speech.queue.enqueue = (text) => requests.push(text)
    speech.observe('one', 2, 0, '当前已经生成的正文。返回后新增的内容。')
    assert.equal(speech.hasHandled('one', { turn: 2, step: 0 }), true)
    speech.observe('one', 3, 0, '下一轮仍然可以播报')
    speech.queue.enqueue = (text) => requests.push(text)
    speech.finish('one', { turn: 3, step: 0, messageId: 'next', text: '下一轮仍然可以播报。', interrupted: false })
    assert.deepEqual(requests, ['下一轮仍然可以播报.'])
    speech.deactivateSession('one')
  })
}

test('manual stop blocks both playback transports after switching', () => {
  const live = new LiveSpeechController()
  const local = new LocalSpeechController()
  for (const speech of [live, local]) {
    speech.activateSession('one')
    speech.prime('one', 2, 0, '已经生成的正文。')
    speech.blockTurn('one', 2)
    speech.deactivateSession('one')
    speech.activateSession('one')
    speech.prime('one', 2, 0, '已经生成的正文。')
    const requests = []
    speech.queue.enqueue = (text) => requests.push(text)
    speech.observe('one', 2, 0, '已经生成的正文。返回后新增的正文。')
    assert.deepEqual(requests, [])
    speech.deactivateSession('one')
  }
})

test('an attached mid-run reply does not replay in full when it finishes', () => {
  const playback = new PlaybackController()
  playback.activateSession('one')
  playback.observeSession('one', true, null, true)
  playback.observeSession('one', false, 'reply')
  assert.equal(playback.claimAutomaticPlayback('one', 'reply'), false)
  playback.observeSession('one', true, null)
  playback.observeSession('one', false, 'next')
  assert.equal(playback.claimAutomaticPlayback('one', 'next'), true)
  playback.dispose()
})
