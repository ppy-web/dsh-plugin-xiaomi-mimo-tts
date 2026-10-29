import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { SessionSpeech } = await loadClientModule('src/host/session-speech.ts')

function setup(extra = {}, policy = {}) {
  const sends = [], delivered = [], errors = [], modes = new Map()
  const service = {
    hasDelivery: () => true,
    async deliver(request, adapter, context) { sends.push({ request, adapter, context }); return { adapter, messageId: String(sends.length) } },
    ...extra,
  }
  const store = { async load(id, fallback) { return modes.get(id) ?? fallback }, async save(id, mode) { modes.set(id, mode) } }
  const speech = new SessionSpeech(service, store, { delivery: 'example', defaultMode: 'manual', maxAutoCharacters: 10, maxDurationMs: 60000, ...policy },
    (agent, result, automatic) => delivered.push({ agent, result, automatic }), code => errors.push(code))
  let seq = 0
  const event = (type, data) => ({ type, data, seq: seq++ })
  const start = (agent, turn = 1) => speech.observe(agent, event('turn/start', { turn }))
  const message = (agent, text, turn = 1, extra = {}) => speech.observe(agent, event('assistant/message', { turn, step: 1, message: { content: [{ type: 'text', text }] }, ...extra }))
  const end = (agent, turn = 1, kind = 'completed') => speech.observe(agent, event('turn/end', { turn, reason: { kind } }))
  const agent = id => ({ id, session: { header: { id } } })
  return { speech, sends, delivered, errors, modes, event, start, message, end, agent }
}

test('automatic mode is per conversation, final-only, deduplicated and short replies only', async () => {
  const run = setup(), a = run.agent('a'), b = run.agent('b')
  try {
    await run.speech.mode(a, 'auto')
    run.start(a); run.start(b)
    run.message(a, '过程。'); run.message(a, '**最终。**')
    run.message(b, '另一会话。')
    run.end(a); run.end(b)
    await settle()
    assert.equal(run.sends.length, 1)
    assert.equal(run.sends[0].context.agent, a)
    assert.equal(run.sends[0].request.text, '最终.')
    assert.equal(run.delivered[0].automatic, true)
    run.end(a)
    await settle()
    assert.equal(run.sends.length, 1)
    run.start(a, 2); run.message(a, '这是一段超过自动朗读长度的文字。', 2); run.end(a, 2)
    await settle()
    assert.equal(run.sends.length, 1, 'long text is not truncated or synthesized')
    assert.equal((await run.speech.mode(b, 'status')).mode, 'manual')
  } finally { await run.speech.dispose() }
})

test('manual speech delivers once and suppresses automatic duplication of the same turn', async () => {
  const run = setup(), a = run.agent('a')
  try {
    await run.speech.mode(a, 'auto')
    run.start(a)
    await run.speech.say(a, { text: '按需。', signal: new AbortController().signal })
    run.message(a, '按需。'); run.end(a)
    await settle()
    assert.equal(run.sends.length, 1)
    assert.equal(run.delivered[0].automatic, false)
    run.start(a, 2); run.message(a, '下一轮。', 2); run.end(a, 2)
    await settle()
    assert.equal(run.sends.length, 2)
  } finally { await run.speech.dispose() }
})

test('failed or interrupted turns, tool-only endings and subagents do not produce automatic audio', async () => {
  const run = setup(), a = run.agent('a')
  try {
    await run.speech.mode(a, 'auto')
    let turn = 1
    for (const kind of ['aborted', 'error', 'max-tokens', 'blocked']) {
      run.start(a, turn); run.message(a, '正文', turn); run.end(a, turn, kind); turn++
    }
    run.start(a, turn); run.message(a, '被打断', turn, { interrupted: true }); run.end(a, turn); turn++
    run.start(a, turn); run.message(a, '旧的过程文字', turn)
    run.speech.observe(a, run.event('assistant/message', { turn, message: { content: [{ type: 'tool-call', name: 'some_tool' }] } }))
    run.end(a, turn)
    const child = run.agent('child'); child.session.header.origin = 'subagent'
    await run.speech.mode(child, 'auto'); run.start(child); run.message(child, '子任务'); run.end(child)
    await settle()
    assert.equal(run.sends.length, 0)
  } finally { await run.speech.dispose() }
})

test('live-only observation ignores historical tails and never replays earlier sequences', async () => {
  const run = setup(), a = run.agent('a')
  try {
    await run.speech.mode(a, 'auto')
    run.message(a, '挂载前已开始'); run.end(a)
    await settle()
    assert.equal(run.sends.length, 0)
    run.start(a, 2); run.message(a, '当前', 2)
    const ending = run.event('turn/end', { turn: 2, reason: { kind: 'completed' } })
    run.speech.observe(a, ending); run.speech.observe(a, ending)
    await settle()
    assert.equal(run.sends.length, 1)
  } finally { await run.speech.dispose() }
})

test('new turn, manual mode and disposal cancel pending jobs without stranding work', async () => {
  const requests = []
  const run = setup({ deliver(request) {
    requests.push(request)
    return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true })
    })
  } }), a = run.agent('a')
  await run.speech.mode(a, 'auto')
  run.start(a); run.message(a, '一'); run.end(a); await settle()
  assert.equal(requests.length, 1)
  run.start(a, 2)
  assert.equal(requests[0].signal.aborted, true)
  run.message(a, '二', 2); run.end(a, 2); await settle()
  await run.speech.mode(a, 'manual')
  assert.equal(requests[1].signal.aborted, true)
  await run.speech.mode(a, 'auto')
  run.start(a, 3); run.message(a, '三', 3); run.end(a, 3); await settle()
  await run.speech.dispose()
  assert.equal(requests[2].signal.aborted, true)
  assert.deepEqual(run.errors, [])
})

test('failed manual sends are not silently retried by automatic mode; unavailable adapters spend no automatic work', async () => {
  let calls = 0
  const run = setup({ async deliver() { calls++; throw new Error('uncertain delivery') } }), a = run.agent('a')
  try {
    await run.speech.mode(a, 'auto'); run.start(a)
    await assert.rejects(run.speech.say(a, { text: '已尝试' }))
    run.message(a, '已尝试'); run.end(a); await settle()
    assert.equal(calls, 1)
  } finally { await run.speech.dispose() }
  const missing = setup({ hasDelivery: () => false }), b = missing.agent('b')
  try {
    await assert.rejects(missing.speech.mode(b, 'auto'), error => error.code === 'speech-delivery-unavailable')
    missing.modes.set('b', 'auto')
    missing.start(b); missing.message(b, '正文'); missing.end(b); await settle()
    assert.equal(missing.sends.length, 0)
  } finally { await missing.speech.dispose() }
})

test('a saved session mode restores without sending historical audio and release cancels only its owner', async () => {
  const run = setup(), a = run.agent('a')
  run.modes.set('a', 'auto')
  run.start(a); run.message(a, '恢复之后'); run.end(a); await settle()
  assert.equal(run.sends.length, 1)
  run.speech.release(a)
  const restored = run.agent('a')
  assert.equal((await run.speech.mode(restored, 'status')).mode, 'auto')
  await run.speech.dispose()
})

test('QQ source switch directly controls automatic full replies and keeps explicit speech available when off', async () => {
  let automatic = true
  const run = setup({ isAutomaticDeliveryEnabled: () => automatic }, { delivery: 'qqbot', sourceControlled: true, maxAutoCharacters: 0, maxDurationMs: 0 })
  const a = run.agent('qq')
  try {
    // A saved manual mode must not suppress the source switch.
    run.modes.set('qq', 'manual')
    const text = '这是一段完整的长回复。'.repeat(1500)
    run.start(a); run.message(a, text); run.end(a); await settle()
    assert.equal(run.sends.length, 1)
    assert.equal(run.sends[0].request.text, (await import('../lib/shared.js')).prepareTtsText(text))
    assert.equal(run.sends[0].request.maxDurationMs, undefined)
    assert.equal(run.sends[0].request.splitLongText, true)
    assert.equal(run.sends[0].context.automatic, true)
    automatic = false
    run.modes.set('qq', 'auto')
    run.start(a, 2); run.message(a, '来源已关闭', 2); run.end(a, 2); await settle()
    assert.equal(run.sends.length, 1, 'a saved auto mode must not bypass the source switch')
    await run.speech.say(a, { text: '用户要求语音' })
    assert.equal(run.sends.length, 2)
    assert.equal(run.sends[1].context.automatic, undefined)
    assert.equal((await run.speech.mode(a, 'status')).mode, 'manual')
    await assert.rejects(run.speech.mode(a, 'auto'), error => error.code === 'speech-mode-source-controlled')
  } finally { await run.speech.dispose() }
})
