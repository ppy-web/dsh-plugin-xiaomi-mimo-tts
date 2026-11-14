import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBreezeTtsPlaybackScope,
  applyTtsLivePlaybackScope,
  applyTtsPlaybackScope,
  BREEZE_AUDIO_TAG_GROUPS,
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  firstTtsSegment,
  firstTtsSegments,
  MAX_TTS_SEGMENT_CHARACTERS,
  prepareTtsText,
  prepareBreezeTtsText,
  splitBreezeTtsSegments,
  splitBreezeTtsSentences,
  splitCompletedTtsSentences,
  splitTtsSegments,
  stripBreezeAudioTags,
  TtsFirstSegmentLimiter,
  TTS_SMART_TRUNCATION_OUTROS,
} from '../lib/shared.js'

test('fenced code stays excluded from speech until a matching fence closes', () => {
  for (const marker of ['```', '~~~~']) {
    const before = '正文。\n'
    const open = before + marker + 'js\nconst privateValue = 123;\n'
    assert.equal(prepareTtsText(open), prepareTtsText(before))
    assert.equal(prepareTtsText(open + marker.slice(0, -1) + '\n尾部代码'), prepareTtsText(before))
    assert.equal(prepareTtsText(open + marker + ' invalid\n尾部代码'), prepareTtsText(before))
    const pending = splitCompletedTtsSentences(open)
    assert.deepEqual(pending.sentences, [before])
    assert.equal(pending.remainder, open.slice(before.length))
    assert.equal(pending.consumed, before.length)
    assert.equal(pending.inCode, true)
    const closed = open + marker + '\n后文。'
    assert.equal(prepareTtsText(closed), prepareTtsText(before + '后文。'))
    assert.deepEqual(splitCompletedTtsSentences(closed).sentences, [before, '后文。'])
    assert.equal(splitCompletedTtsSentences(closed).inCode, false)
  }
  const longOpen = '正文。\n~~~python\n' + 'print(privateValue);'.repeat(100)
  assert.equal(prepareTtsText(longOpen), '正文.')
  assert.equal(splitCompletedTtsSentences(longOpen).inCode, true)
})

test('fenced code inside lists and blockquotes stays excluded from speech', () => {
  for (const text of [
    '- 项目\n\n    ```js\n    secret();\n    ```\n\n后文。',
    '1. 第一步\n\n    ```js\n    secret();\n    ```\n\n后文。',
    '> ```js\n> secret();\n> ```\n\n后文。',
  ]) {
    const prepared = prepareTtsText(text)
    assert.ok(!prepared.includes('secret'), prepared)
    assert.ok(!prepared.includes('```'), prepared)
    assert.ok(prepared.includes('后文'), prepared)
    const split = splitCompletedTtsSentences(text)
    assert.equal(split.inCode, false)
    assert.ok(!split.sentences.join('').includes('secret'))
    assert.ok(!split.sentences.join('').includes('```'))
    assert.ok(split.sentences.join('').includes('后文'))
  }
})

test('an unfinished fence inside a list or blockquote is held until its container closes', () => {
  const list = splitCompletedTtsSentences('- 项目\n\n    ```js\n    secret();\n')
  assert.equal(list.inCode, true)
  assert.ok(list.sentences.join('').includes('项目'))
  assert.ok(!list.sentences.join('').includes('secret'))

  const quote = splitCompletedTtsSentences('正文。\n> ```js\n> secret();\n')
  assert.equal(quote.inCode, true)
  assert.ok(quote.sentences.join('').includes('正文'))
  assert.ok(!quote.sentences.join('').includes('secret'))

  const ended = splitCompletedTtsSentences('正文。\n> ```js\n> secret();\n\n后文。')
  assert.equal(ended.inCode, false)
  assert.match(ended.sentences.join(''), /后文/u)
  assert.doesNotMatch(ended.sentences.join(''), /secret|```/u)
})

test('keeps indented list content while removing real indented code', () => {
  const nested = prepareTtsText('- 第一步\n\n    这是第一步的详细说明。\n- 第二步')
  assert.match(nested, /第一步.*这是第一步的详细说明.*第二步/u)
  const ordered = prepareTtsText('1. 第一步\n    1. 子步骤甲\n    2. 子步骤乙\n2. 第二步')
  assert.match(ordered, /第一步.*子步骤甲.*子步骤乙.*第二步/u)
  assert.equal(prepareTtsText('正文。\n\n    const hidden = 1\n\n后文。'), '正文.后文.')
})

test('reference links, footnotes and definitions never reach speech', () => {
  assert.equal(prepareTtsText('先看 [导出结果][report]。\n\n[report]: https://example.com/x'), '先看 导出结果.')
  assert.equal(prepareTtsText('如图 ![示意图][pic] 所示。\n\n[pic]: https://example.com/a.png'), '如图 所示.')
  for (const text of [
    '先看 [导出结果][report]。\n\n[report]: https://example.com/x',
    '结论见下。[^1]\n\n[^1]: 隐藏脚注',
    '如图 ![示意图][pic] 所示。\n\n[pic]: https://example.com/a.png',
    '参见 [报告]。\n\n[报告]: https://example.com/r',
  ]) {
    const prepared = prepareTtsText(text)
    assert.doesNotMatch(prepared, /report|pic\b|https?:|\^1|隐藏脚注/u)
  }
})

test('keeps comparison meaning, contractions and word boundaries', () => {
  assert.equal(prepareTtsText('条件 3<4 成立。'), '条件 3 小于 4 成立.')
  assert.equal(prepareTtsText('要求 x>0。'), '要求 x 大于 0.')
  assert.equal(prepareTtsText('Check x<10 and y>2.'), 'Check x less than 10 and y greater than 2.')
  assert.equal(prepareTtsText("Don't stop; we're sure it's fine."), "Don't stop; we're sure it's fine.")
  const math = prepareTtsText('计算 2*3 和 max_retry_count。')
  assert.doesNotMatch(math, /23|maxretrycount/u)
  assert.match(math, /2 3/u)
  assert.match(math, /max retry count/u)
})

test('decodes entities and removes HTML comments, scripts, rules and setext underlines', () => {
  assert.equal(prepareTtsText('A&amp;B 与 3&lt;4。'), 'A&B 与 3 小于 4.')
  assert.equal(prepareTtsText('使用 &lt;b&gt;bold&lt;/b&gt; 标记。'), '使用 bold 标记.')
  assert.equal(prepareTtsText('正文。\n<!-- 隐藏\n隐藏2 -->\n后文。'), '正文.后文.')
  assert.equal(prepareTtsText('正文。\n<!-- 未闭合\n隐藏2\n后文。'), '正文.')
  assert.equal(prepareTtsText('正文。\n<script>\nsecret()\n</script>\n后文。'), '正文.后文.')
  assert.equal(prepareTtsText('第一部分\n\n---\n\n第二部分'), '第一部分.第二部分')
  assert.equal(prepareTtsText('重要结论\n====\n\n正文。'), '重要结论.正文.')
})

test('removes task markers, table delimiters, heading marks and inline fence remnants', () => {
  const task = prepareTtsText('- [ ] 未完成\n- [x] 已完成')
  assert.match(task, /未完成.*已完成/u)
  assert.doesNotMatch(task, /\[|\]|x 已完成/u)
  const table = prepareTtsText('| 名称 | 值 |\n| --- | :---: |\n| 甲 | 1 |')
  assert.match(table, /名称.*值.*甲.*1/u)
  assert.doesNotMatch(table, /---|:/u)
  const inline = prepareTtsText('运行 ``` 包裹，然后 ``` 结束。')
  assert.match(inline, /运行.*包裹.*结束/u)
  assert.doesNotMatch(inline, /```/u)
  assert.equal(prepareTtsText('#标题\n\n正文。'), '标题.正文.')
})

test('normalized sentence ends stream promptly while an unfinished decimal stays buffered', () => {
  assert.deepEqual(splitCompletedTtsSentences('第一句.第二句.未完').sentences, ['第一句.', '第二句.'])
  assert.equal(splitCompletedTtsSentences('温度是3.').consumed, 0)
  assert.deepEqual(splitCompletedTtsSentences('温度是3.14度.未完').sentences, ['温度是3.14度.'])
})

test('preserves documented Breeze audio tags while cleaning text', () => {
  assert.equal(prepareBreezeTtsText('你好，[轻笑]世界！(sighs)继续。'), '你好,[轻笑]世界!(sighs)继续.')
  const unsupported = prepareBreezeTtsText('你好，[未知标签]世界')
  assert.ok(!unsupported.includes('未知标签'), 'an unsupported tag must not be spoken as words')
  assert.ok(unsupported.includes('你好') && unsupported.includes('世界'))
})

test('every documented Breeze tag survives on Breeze and disappears for other providers', () => {
  for (const group of BREEZE_AUDIO_TAG_GROUPS) {
    for (const tag of [...group.zh, ...group.en]) {
      assert.ok(prepareBreezeTtsText(`甲${tag}乙`).includes(tag), `Breeze must keep ${tag}`)
    }
  }
  const plain = prepareTtsText('你好，[轻笑]世界！(sighs)继续。')
  for (const word of ['轻笑', 'sighs']) assert.ok(!plain.includes(word), `${word} must not be read as text`)
  for (const word of ['你好', '世界', '继续']) assert.ok(plain.includes(word))
})

test('keeps Breeze tags intact across provider-sized chunks', () => {
  const text = `${'甲'.repeat(995)}[轻笑]乙`
  const chunks = splitBreezeTtsSegments(text)
  assert.equal(chunks.join(''), prepareBreezeTtsText(text))
  assert.ok(chunks.every(chunk => !chunk.includes('[轻') || chunk.includes('[轻笑]')))
})

test('reads Breeze scopes by semantic sentence and keeps audio tags attached', () => {
  const sentences = [
    `[轻笑]${'甲'.repeat(180)}。`,
    `${'乙'.repeat(180)}。`,
    `${'丙'.repeat(180)}。`,
    `${'丁'.repeat(60)}。`,
  ]
  const text = sentences.join('')
  const preparedSentences = sentences.map(prepareBreezeTtsText)
  assert.deepEqual(splitBreezeTtsSentences(text), preparedSentences)
  const smart = applyBreezeTtsPlaybackScope(text, 'smart', true, () => 0)
  assert.equal(smart, `${preparedSentences[0]}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
  assert.equal(applyBreezeTtsPlaybackScope(text, 'smart', false), prepareBreezeTtsText(text))
})

test('strips documented Breeze tags for browser speech without eating other brackets', () => {
  const text = stripBreezeAudioTags('你好，[轻笑]世界！[未知](sighs)')
  assert.ok(!text.includes('轻笑'))
  assert.ok(!text.includes('sighs'))
  assert.ok(text.includes('世界'))
  assert.ok(text.includes('[未知]'))
})

test('keeps long sentences whole across synthesis chunks and opening playback', () => {
  const sentences = [
    `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`,
    `${'乙'.repeat(100)}，${'丙'.repeat(180)}。`,
    '最后一句。',
  ].map(prepareTtsText)
  const text = sentences.join('')
  assert.deepEqual(splitTtsSegments(text), sentences)
  assert.equal(firstTtsSegment(text), sentences[0])
})

test('Smart playback finishes a long opening sentence before adding a closing cue', () => {
  const first = `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`
  const text = prepareTtsText(first + `${'乙'.repeat(600)}。`)
  const result = applyTtsPlaybackScope(text, 'smart', true, () => 0)
  assert.equal(result, `${prepareTtsText(first)}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
})

test('adds the Smart closing cue when resumed live playback reaches completion', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const first = `${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`
  const partial = prepareTtsText(first + `${'乙'.repeat(40)}`)
  const final = prepareTtsText(first + `${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)

  const checkpoint = applyTtsLivePlaybackScope(partial, 'smart', limiter)
  assert.equal(checkpoint, prepareTtsText(first))
  assert.equal(
    applyTtsLivePlaybackScope(final, 'smart', limiter, true, () => 0),
    `${prepareTtsText(first)}${TTS_SMART_TRUNCATION_OUTROS[0]}`,
  )
})

test('ends a chunk before the next sentence when combining them exceeds the preferred maximum', () => {
  const first = `${'甲'.repeat(100)}。`
  const next = `${'乙'.repeat(200)}。`
  assert.deepEqual(splitTtsSegments(first + next), [first, next].map(prepareTtsText))
  assert.equal(firstTtsSegment(first + next), prepareTtsText(first))
})

test('starts streaming an unfinished first sentence after enough speech arrives', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const first = `${'甲'.repeat(100)}。`
  const next = `${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS + 40)}。`
  const prefix = prepareTtsText(next.slice(0, DEFAULT_TTS_SEGMENT_CHARACTERS))
  assert.equal(limiter.limit(prefix), prefix)
  assert.equal(limiter.limit(prefix + next.slice(DEFAULT_TTS_SEGMENT_CHARACTERS, 180)), prepareTtsText(next.slice(0, 180)))
  const whole = prepareTtsText(next)
  assert.equal(limiter.limit(whole), whole)
  assert.equal(limiter.limit(whole + first, true), whole)
})

test('does not lock a short completed first segment before the reply is complete', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const short = limiter.limit('你好。')
  const extended = prepareTtsText('你好。这里是后续内容。')
  assert.ok(extended.startsWith(short))
  assert.equal(limiter.limit(extended, true), extended)
})

test('keeps provisional streaming text append-only while punctuation is still arriving', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const prefix = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)
  const first = limiter.limit(`${prefix}，`)
  const next = limiter.limit(`${prefix}，。`)
  assert.ok(next.startsWith(first))
})

test('reserves the second live segment for a short tail before an unfinished long sentence', () => {
  const limiter = new TtsFirstSegmentLimiter(2)
  const first = `${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`
  const short = `${'乙'.repeat(40)}。`
  const long = `${'丙'.repeat(300)}。`
  const expected = prepareTtsText(first + short)
  assert.equal(limiter.limit(first), prepareTtsText(first))
  assert.equal(limiter.limit(first + short), expected)
  assert.equal(limiter.limit(first + short + long.slice(0, DEFAULT_TTS_SEGMENT_CHARACTERS)), expected)
  assert.equal(limiter.limit(first + short + long), expected)
  assert.equal(limiter.limit(first + short + long, true), expected)
})

test('live scopes only grow within their final range as short tails become separate groups', () => {
  for (const count of [1, 2]) {
    for (const sizes of [[40, 300], [160, 40, 300], [160, 50, 200], [160, 100, 200], [100, 100, 40, 300]]) {
      const text = sizes.map((size, index) => `${String.fromCodePoint(0x7532 + index).repeat(size)}。`).join('')
      const expected = firstTtsSegments(text, count)
      const limiter = new TtsFirstSegmentLimiter(count)
      let previous = ''
      for (let length = 1; length <= text.length; length += 13) {
        const scoped = limiter.limit(text.slice(0, length))
        assert.ok(scoped.startsWith(previous), `scope ${count} shrank for sentence sizes ${sizes}`)
        assert.ok(expected.startsWith(scoped), `scope ${count} exceeded its final range for sentence sizes ${sizes}`)
        previous = scoped
      }
      const final = limiter.limit(text, true)
      assert.ok(final.startsWith(previous))
      assert.ok(expected.startsWith(final))
    }
  }
})

test('keeps the completed first sentence as the final Smart scope after provisional streaming', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const sentence = `${'甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)}。`
  assert.equal(limiter.limit(sentence.slice(0, DEFAULT_TTS_SEGMENT_CHARACTERS)), prepareTtsText(sentence.slice(0, DEFAULT_TTS_SEGMENT_CHARACTERS)))
  assert.equal(limiter.limit(sentence), prepareTtsText(sentence))
  assert.equal(limiter.limit(sentence + '后续内容。', true), prepareTtsText(sentence))
})

test('flushes an unterminated final sentence without hard cutting it', () => {
  const text = '甲'.repeat(MAX_TTS_SEGMENT_CHARACTERS + 60)
  const limiter = new TtsFirstSegmentLimiter()
  assert.equal(limiter.limit(text), prepareTtsText(text))
  assert.equal(limiter.limit(text, true), text)
  assert.deepEqual(splitTtsSegments(text), [text])
})

test('recognizes normalized and English sentence ends without splitting decimal numbers', () => {
  for (const first of ['数值是3.14。', 'Value is 3.14. ']) {
    const limiter = new TtsFirstSegmentLimiter()
    assert.equal(limiter.limit(`${first}下一句尚未完成`), prepareTtsText(first))
  }
  const first = `${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}3.14。`
  assert.equal(firstTtsSegment(first + '下一句。'.repeat(50)), prepareTtsText(first))
  const limiter = new TtsFirstSegmentLimiter()
  assert.equal(limiter.limit(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}3.`), prepareTtsText(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}3.`))
  assert.equal(limiter.limit(first + '下一句尚未完成'), prepareTtsText(first))
})
