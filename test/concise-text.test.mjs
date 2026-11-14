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

test('Concise keeps prose that merely starts with a source label', () => {
  assert.match(concise('来源：本地缓存。\n\n结论：可用。'), /本地缓存.*可用/u)
  assert.match(
    concise(['## 来源：本地缓存', '正文结论。', '## 下一步', '继续。'].join('\n\n')),
    /正文结论.*继续/u,
  )
  assert.match(concise('## Sources: internal logs\n\nBody text.'), /Body text/u)
  assert.doesNotMatch(concise('参考资料：[来源名称](https://example.com/bookings)'), /来源名称/u)
  assert.doesNotMatch(concise('正文。\n\n## References\n\n[链接](https://example.com)'), /链接/u)
})

test('Concise reads the correction rather than struck text', () => {
  const text = concise('价格从 ~~100 元~~ 调整为 80 元。')
  assert.match(text, /80 元/u)
  assert.doesNotMatch(text, /100 元/u)
})

test('Concise reserves room for an unmarked closing question as well as the opening', () => {
  const opening = '导出的三份文件都在任务目录中。'
  const question = '你希望先核对文件内容，还是直接处理重复记录？'
  const text = concise([
    opening,
    '原因是定时任务从另一个工作目录启动。',
    '建议先检查每个文件的修改时间和大小。',
    '下一步可以查看日志，确认任务是否报错。',
    '结论是当前导出流程已经生成所有文件。',
    '请确认是否还需要保留本次运行的原始日志。',
    question,
  ].join('\n\n'))

  assert.match(text, /三份文件.*核对文件内容.*处理重复记录/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise keeps a concrete conditional action at the end and skips a generic follow-up', () => {
  const text = concise([
    '本次备份保存在独立目录中。',
    '结论是备份文件可以正常读取。',
    '原因是这次使用了新的备份目录。',
    '建议先核对文件大小和修改时间。',
    '下一步还可以检查日志中的警告。',
    '如果要接着做，请先验证恢复流程，再删除旧备份。',
    '如果要接着做，我也可以帮你整理后续计划。',
    '## 参考资料',
    '[备份文档](https://example.com/backup)',
  ].join('\n\n'))

  assert.match(text, /独立目录.*先验证恢复流程.*删除旧备份/u)
  assert.doesNotMatch(text, /后续计划|备份文档/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise can use another sentence in the opening when the first and the tail do not fit together', () => {
  const longOpening = '本次导出已经完成，三个原始文件和对应索引都保存到了独立目录，文件名、记录数量、修改时间、来源信息以及每一项校验结果都已经逐项核对完毕，而且全部检查记录也存入了同一个目录，另外还为每份文件生成了单独的校验报告供审核时参考，并把报告发送给负责验收的人员以便他们稍后逐项核对。'
  const openingResult = '所有文件均可正常读取。'
  const closing = '接下来请确认由谁负责验收，并告知是否需要保留旧备份，以便安排后续处理。'
  const text = concise([`${longOpening}${openingResult}`, closing].join('\n\n'))

  assert.ok([...longOpening + closing].length > 150)
  assert.match(text, /所有文件均可正常读取.*确认由谁负责验收.*保留旧备份/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise favors a complete closing sentence when neither edge can fit with the other', () => {
  const opening = '本次导出已经完成，三个原始文件和对应索引都保存到了独立目录，文件名、记录数量、修改时间、来源信息以及每一项校验结果都已经逐项核对完毕，所有检查记录和校验报告也保存在同一个目录中，并为后续验收保留了原始数据、逐项校验记录以及独立的恢复步骤说明，等待负责人员确认后再安排迁移。'
  const closing = '接下来请确认由谁负责验收，并告知是否需要保留旧备份，以便安排后续处理。'
  const text = concise([opening, closing].join('\n\n'))

  assert.ok([...opening + closing].length > 150)
  assert.match(text, /确认由谁负责验收.*保留旧备份/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise reserves a multi-sentence tail before a competing opening', () => {
  const opening = '本次导出已经完成，三个原始文件和对应索引都保存到了独立目录，文件名、记录数量、修改时间以及每一项校验结果都已经逐项核对完毕，全部文件都能正常打开，校验报告也保存在同一目录供后续审核，并已为各个部门准备验收清单、核对步骤和问题反馈表，等待负责人安排统一检查。'
  const tail = '恢复检查仍未通过，当前备份不能用于迁移。请先保留原始数据并重新生成备份。你希望现在开始重新备份吗？'
  assert.ok([...opening + tail].length > 150)
  const text = concise([opening, '普通背景说明。'.repeat(30), tail].join('\n\n'))
  assert.match(text, /恢复检查仍未通过.*保留原始数据.*重新备份吗/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise counts mixed Unicode and inter-sentence pauses within the budget', () => {
  const text = concise(['𠀀'.repeat(45), '历史背景。'.repeat(40), '核对完成。请先保留备份。'].join('\n\n'))
  assert.match(text, /𠀀.*核对完成.*保留备份/u)
  assert.ok([...text].length <= 150, text)
  assert.doesNotMatch(text, /历史背景/u)
})

test('Concise keeps the first and last useful sentences in one long paragraph', () => {
  const paragraph = [
    '所有导出文件都保存在任务目录。',
    '原因是定时任务使用了新的工作目录。',
    '建议查看文件的修改时间和大小。',
    '下一步可以检查日志中的告警。',
    '结论是每个任务都能生成结果。',
    '建议给每个任务设置独立的输出目录。',
    '原因是这样可以避免并行任务互相覆盖。',
    '下一步可以检查每个文件的完整性。',
    '验收人员可以按照各自的权限分批检查文件，检查结束后统一提交验收记录。',
    '你想先验证哪一个文件？',
  ].join('')
  const text = concise(paragraph)

  assert.ok([...paragraph].length > 150)
  assert.match(text, /所有导出文件都保存在任务目录.*你想先验证哪一个文件/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise preserves the context of a closing reference to a problem', () => {
  const text = concise([
    '备份文件已经生成。',
    '这是供查阅的背景信息。'.repeat(20),
    '原因是原先的自动备份任务已经被暂时关闭。',
    '建议检查备份文件的大小和创建时间。',
    '下一步先核对备份目录里的文件数量。',
    '结论是备份文件目前可以被正常读取。',
    '目前还没有验证备份能否恢复。',
    '这个问题需要你确认。',
  ].join('\n\n'))

  assert.match(text, /备份文件已经生成.*没有验证备份能否恢复.*这个问题需要你确认/u)
  assert.ok([...text].length <= 150, text)
})

test('Concise does not read an unresolvable closing reference by itself', () => {
  const text = concise([
    '检查结果已经记录。',
    '关于备份恢复的具体情况'.repeat(20) + '。',
    '这个问题需要你确认。',
  ].join('\n\n'))

  assert.match(text, /检查结果已经记录/u)
  assert.doesNotMatch(text, /这个问题/u)
})

test('Concise favors opening and closing speech in English too', () => {
  const text = concise([
    'The export finished successfully.',
    'The cause was a change to the working directory.',
    'We recommend checking the file timestamps and sizes.',
    'The next step is to inspect the warning logs.',
    'The result is that all three files were created.',
    'Would you like to inspect the files or restore the backup first?',
  ].join('\n\n'))

  assert.match(text, /export finished successfully.*inspect the files or restore the backup first/iu)
  assert.ok([...text].length <= 150, text)
})

test('Concise keeps an adjacent qualification with its conclusion', () => {
  const text = concise([
    '结论是可以重新导出。', '但不能覆盖原文件。',
    '这是供查阅的背景信息。'.repeat(20),
    '下一步请核对目标目录。',
  ].join('\n\n'))
  assert.match(text, /可以重新导出.*不能覆盖原文件.*核对目标目录/u)
})

test('Concise keeps adjacent warnings with their action across paragraphs and list items', () => {
  const action = '建议清理旧备份。'
  const warning = '不要删除唯一可用的恢复副本。'
  for (const pair of [action + warning, action + '\n\n' + warning, '- ' + action + '\n- ' + warning]) {
    const text = concise([pair, '普通背景说明。'.repeat(25), '下一步确认可用空间。'].join('\n\n'))
    assert.match(text, /清理旧备份.*不要删除唯一可用的恢复副本/u)
    assert.ok([...text].length <= 150, text)
  }
})

test('Concise drops an action rather than separating an over-budget warning', () => {
  const action = '建议清理旧备份，在操作之前先整理目录中的临时文件，并记录每一份历史归档的创建时间和用途，核对目录权限、剩余容量以及当前任务的运行状态，确认迁移任务已经结束，核对所有部门的验收记录，并与维护人员确认当前备份的保留时间和后续清理计划，完成这些准备以后再释放磁盘空间。'
  const warning = '不要删除唯一可用的恢复副本，否则这次迁移失败后就没有任何办法找回原始记录。'
  assert.ok([...action + warning].length > 150)
  for (const pair of [action + warning, action + '\n\n' + warning, '- ' + action + '\n- ' + warning]) {
    const text = concise([pair, '普通背景说明。'.repeat(25), '下一步确认可用空间。'].join('\n\n'))
    assert.doesNotMatch(text, /清理旧备份/u)
    assert.match(text, /确认可用空间/u)
  }
})

test('Concise does not bind warnings through headings or code blocks', () => {
  for (const boundary of ['## 恢复检查', '```text\n检查日志\n```', '---']) {
    const text = concise(['建议清理旧备份。', boundary, '不要删除唯一副本，'.repeat(15) + '请先验证恢复。', '下一步确认可用空间。'].join('\n\n'))
    assert.match(text, /清理旧备份.*确认可用空间/u)
    assert.doesNotMatch(text, /不要删除唯一副本/u)
  }
})

test('Concise preserves short configuration values, versions and encodings', () => {
  const text = concise('必须将配置设为 `read-only`，不要使用 `read-write`。版本是 `v1.2.3`，输出格式为 `UTF-8`。')
  for (const value of ['read-only', 'read-write', 'v1.2.3', 'UTF-8']) assert.ok(text.includes(value), text)
})

test('Concise omits sentences with unreadable inline conditions or commands instead of reading holes', () => {
  for (const sentence of [
    '只有在 `status === "ready"` 时才能删除备份。',
    '运行 `npm test` 就可以了。',
    '确认 `/var/backups/current` 存在后再清理。',
    '只有在 **`status === "ready"`** 时才能删除备份。',
    '检查 [执行 `npm test` 的结果](https://example.com/check)。',
  ]) {
    assert.equal(concise(sentence), '')
    const text = concise(sentence + '下一步核对备份。')
    assert.match(text, /核对备份/u)
    assert.doesNotMatch(text, /删除|运行|清理|执行/u)
  }
})

test('Concise drops an action whose adjacent restriction contains unreadable code', () => {
  for (const separator of ['', '\n\n', '\n- ']) {
    const text = concise('建议清理旧备份。' + separator + '但必须先确认 `status === "ready"`。下一步核对磁盘空间。')
    assert.match(text, /核对磁盘空间/u)
    assert.doesNotMatch(text, /清理|必须先确认/u)
  }
  assert.equal(concise('运行 `npm test`。因此可以删除备份。'), '')
})

test('Concise does not read a table row with a missing inline condition', () => {
  assert.equal(concise('| 操作 | 条件 |\n| --- | --- |\n| 删除备份 | `status === "ready"` |'), '')
})

test('Concise retains an important middle cause along with the opening and closing', () => {
  const text = concise([
    '已修复导出时的文件名冲突。',
    '这是供查阅的背景信息。'.repeat(25),
    '原因是两个任务同时使用了相同的临时目录。',
    '下一步请重新导出，并核对文件是否完整。',
    '如果要接着做，我也可以帮你整理后续计划。',
  ].join('\n\n'))
  assert.match(text, /文件名冲突.*相同的临时目录.*重新导出/u)
  assert.doesNotMatch(text, /背景信息|后续计划/u)
  assert.ok([...text].length <= 150)
})

test('Concise uses the available character budget for useful context outside a short conclusion', () => {
  const details = [
    '导出文件默认保存在当前项目的输出目录。',
    '每个任务都有独立的临时目录来保存中间文件。',
    '失败任务的临时文件会在重试之前自动清理。',
    '两个任务并行运行时也可以使用相同的文件名。',
    '任务日志会记录完整路径，方便之后查找文件。',
    '页面上的下载按钮仍然可以获取最终文件。',
    '已经存在的旧文件会继续保留，不会被覆盖。',
  ]
  const conclusion = '建议先导出一份小文件，确认结果后再批量处理。'
  const text = concise([...details, conclusion].join('\n\n'))
  assert.ok(text.includes('确认结果后再批量处理'), text)
  assert.ok(details.filter(detail => text.includes(detail.split(/[，。]/u)[0])).length >= 3, text)
  assert.ok([...text].length > 90 && [...text].length <= 150, text)
})

test('Concise never extracts a continuation when its antecedent cannot fit', () => {
  const text = concise([
    '当前的输出目录'.repeat(25) + '。',
    '因此需要先迁移这些文件，再清理原目录。',
    '下一步请核对备份文件。',
  ].join('\n\n'))
  assert.ok(text.includes('核对备份文件'), text)
  assert.doesNotMatch(text, /迁移|清理原目录/u)
})

test('Concise skips code-only replies and sentences that would have to be cut', () => {
  assert.equal(concise('```sh\nnpm test'), '')
  assert.equal(concise('`pwd`'), '')
  assert.equal(concise('没有句号'.repeat(60)), '')
  assert.match(concise('下一步先备份。\n\n' + '没有句号'.repeat(60)), /^下一步先备份[.。]$/u)
})

test('Concise enforces the same character budget across playback speeds and Unicode', () => {
  for (const rate of [0.5, 1, 2]) {
    assert.equal([...applyTtsReadScope('甲'.repeat(149) + '。', 'concise', rate)].length, 150)
  }
  assert.equal(concise('甲'.repeat(150) + '。'), '')
  const text = concise('𠀀'.repeat(100) + '。')
  assert.equal([...text].length, 101)
  assert.ok(text.length > 150)
  assert.equal(concise('𠀀'.repeat(151) + '。'), '')
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
    timeline: { turnOrder: [7], turns: new Map([[7, { turn: 7, end: { data: { reason: { kind: 'completed' } } } }]]) },
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
