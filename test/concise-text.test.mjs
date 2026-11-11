import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, readConfig } from '../lib/index.js'
import { applyTtsReadScope, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const concise = markdown => applyTtsReadScope(markdown, 'concise')

test('Concise removes non-speech Markdown and retains prose, quantities and useful link labels', () => {
  const text = concise([
    '你好！',
    '先看 [导出结果][report]。The limit is **12.5 MB/s**. 温度不能超过 `36.5℃`。[^detail]',
    '',
    '2026-05-09 09:15:02 INFO hiddenLog',
    '$ git status --short',
    '',
    '```json',
    '{ "hiddenCode": true }',
    '```',
    '',
    '![hiddenImage](https://example.com/image.png)',
    '',
    '$$',
    '\\frac{hiddenMath}{1}',
    '$$',
    '',
    '\\[hiddenDisplay = 1\\]',
    '\\(hiddenInline = 2\\)',
    '',
    '[report]: https://example.com/export',
    '[^detail]: hiddenFootnote',
    '',
    '## References',
    '### Extra reading',
    'hiddenReference',
  ].join('\n'))

  for (const phrase of ['先看 导出结果', '12.5 MB/s', '不能超过 36.5摄氏度']) assert.ok(text.includes(phrase), text)
  assert.doesNotMatch(text, /hidden|git status|https:|你好/u)
})

test('Concise reads the first data row with its column labels when a table carries the answer', () => {
  const text = concise([
    '## 比较结果',
    '',
    '结果如下：',
    '',
    '| 地点 | 步行时间 | 价格 |',
    '| --- | ---: | ---: |',
    '| 北湾图书室 | 8 分钟 | 0 元 |',
    '| 东桥共享空间 | 10 分钟 | 60 元 |',
  ].join('\n'))
  for (const phrase of ['地点', '北湾图书室', '步行时间', '8 分钟', '价格', '0 元']) assert.ok(text.includes(phrase), text)
  assert.doesNotMatch(text, /东桥|60 元|\|/u)
})

test('Concise keeps prices that share a paragraph and omits inline formulas', () => {
  const text = concise('Standard costs $10. Pro costs $12.50. Use the result from $2 + 3$ to compare.')
  assert.ok(text.includes('$10') && text.includes('$12.50'), text)
  assert.doesNotMatch(text, /2 \+ 3/u)
})

test('Concise retains an opening recommendation and a useful tail before the references', () => {
  const lead = '优先看北湾图书室。'
  const condition = '如果北湾已经约满，先确认东桥有没有空位。'
  const text = concise([
    lead,
    '这是供查阅的背景信息。'.repeat(25),
    condition,
    '参考资料：[来源名称](https://example.com/bookings)',
  ].join('\n\n'))
  assert.match(text, /^优先看北湾图书室.*北湾已经约满.*确认东桥/u)
  assert.doesNotMatch(text, /背景信息|来源名称/u)
})

test('Concise keeps an adjacent qualification with its conclusion', () => {
  const text = concise([
    '结论是可以重新导出。', '但不能覆盖原文件。',
    '这是供查阅的背景信息。'.repeat(20),
    '下一步请核对目标目录。',
  ].join('\n\n'))
  assert.match(text, /可以重新导出.*不能覆盖原文件.*核对目标目录/u)
})

test('Concise skips code-only replies and sentences that would have to be cut', () => {
  assert.equal(concise('```sh\nnpm test'), '')
  assert.equal(concise('`pwd`'), '')
  assert.equal(concise('没有句号'.repeat(60)), '')
  assert.match(concise('下一步先备份。\n\n' + '没有句号'.repeat(60)), /^下一步先备份[.。]$/u)
})

test('Concise uses Unicode characters rather than UTF-16 code units for the text budget', () => {
  const text = concise('𠀀'.repeat(70) + '。')
  assert.equal([...text].length, 71)
  assert.ok(text.length > 120)
  assert.equal(concise('𠀀'.repeat(121) + '。'), '')
})

test('the Host accepts persisted first-segment settings and resolves them as Concise', () => {
  const stored = Config({ readScope: 'first-segment' })
  assert.equal(readConfig(stored).readScope, 'concise')
  assert.equal(resolveTtsSettings({ readScope: stored.readScope.get() }).readScope, 'concise')
  assert.equal(readConfig(Config({ readScope: 'concise' })).readScope, 'concise')
})

const { automaticReplyMode } = await loadClientModule('src/client/conversation/automatic-reading.ts')
const { automaticAssistantMessageId, messageText } = await loadClientModule('src/client/conversation/message-text.ts')
const { playCompletedReply, handleReadAloudClick } = await loadClientModule('src/client/playback/read-aloud-playback.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')

test('Concise chooses the settled host answer for automatic speech and the selected message for manual speech', () => {
  const settings = resolveTtsSettings({ readScope: 'concise', localSpeechMode: 'disabled' })
  const mode = automaticReplyMode('all', settings.readScope)
  const nodes = new Map()
  const chat = {
    timeline: { turnOrder: [7] },
    nodes,
    locations: { getTurn: () => ['tail'] },
    legacy: { nodes: [
      { kind: 'assistant', messageId: 'process', blocks: [{ kind: 'text', text: '## 过程\n\n正在检查配置。' }] },
      { kind: 'assistant', messageId: 'final', blocks: [{ kind: 'text', text: '## 结果\n\n已经恢复导出。\n\n```log\nhiddenLog\n```' }] },
      { kind: 'assistant', messageId: 'tool-only', blocks: [] },
    ] },
  }
  const playback = new PlaybackController()
  const spoken = []
  const live = { configure() {}, playCompleted: (session, message, text) => spoken.push({ message, text }) }
  const local = { cancelSession() {} }
  const request = messageId => ({
    sessionId: 'session', messageId, text: messageText(chat.legacy, messageId),
    playback, live, local, settings, apiKeySupported: true,
  })
  playback.activateSession('session')
  assert.equal(automaticAssistantMessageId(chat, mode), null)
  playback.observeSession('session', true, automaticAssistantMessageId(chat, mode))
  assert.equal(playback.claimAutomaticPlayback('session', 'process'), false)
  nodes.set('tail', { kind: 'turn-tail', data: { closing: { finalNode: { messageId: 'final' } } } })
  playback.observeSession('session', false, automaticAssistantMessageId(chat, mode))
  assert.equal(playback.claimAutomaticPlayback('session', 'final'), true)
  playCompletedReply(request('final'), true)
  assert.equal(playback.claimAutomaticPlayback('session', 'final'), false)

  handleReadAloudClick(request('process'), playback.getSnapshot())
  assert.deepEqual(spoken.map(item => item.message), ['final', 'process'])
  assert.match(spoken[0].text, /^已经恢复导出[.。]$/u)
  assert.match(spoken[1].text, /^正在检查配置[.。]$/u)
})

test('Concise skips automatic synthesis for code-only replies and reports no text on a manual click', () => {
  const playback = new PlaybackController()
  playback.activateSession('session')
  const request = {
    sessionId: 'session', messageId: 'code', text: '```ts\nconst result = 2\n```',
    settings: resolveTtsSettings({ readScope: 'concise' }),
    apiKeySupported: true, playback, live: { configure: () => assert.fail('unexpected synthesis') }, local: {},
  }
  assert.equal(playCompletedReply(request, true), false)
  assert.equal(playback.getSnapshot().status, 'idle')
  handleReadAloudClick(request, playback.getSnapshot())
  assert.equal(playback.getSnapshot().error, 'no-text')
})
