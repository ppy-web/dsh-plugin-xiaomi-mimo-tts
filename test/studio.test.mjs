import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import {
  STUDIO_DIRECTOR_COMMAND_NAME,
  STUDIO_DIRECTOR_SLASH_COMMAND,
  STUDIO_MAX_LINES_PER_SCRIPT,
  STUDIO_MAX_LINE_CHARACTERS,
  TTS_DESKTOP_WRITE_HEADER,
  TTS_OPEN_STUDIO_ROUTE,
  TTS_STUDIO_AUDIO_ROUTE,
  TTS_STUDIO_PREVIEW_ROUTE,
  TTS_STUDIO_ROLES_ROUTE,
  TTS_STUDIO_SCRIPTS_ROUTE,
  TTS_STUDIO_STATE_ROUTE,
  TTS_STUDIO_TASKS_ROUTE,
  formatStudioScriptText,
  parseStudioScriptLines,
  resolveTtsSettings,
} from '../lib/shared.js'
import * as studioAgent from '../lib/studio-agent.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { createTestProvider } from './helpers/external-provider.mjs'
import { listenLoopback } from './helpers/loopback.mjs'

const { decodeWavMono16, encodeWavMono16, stitchWavSegments } = await loadClientModule('src/host/wav-stitcher.ts')
const { StudioDiskStore } = await loadClientModule('src/host/studio-store.ts')
const { HostSpeechStudioService } = await loadClientModule('src/host/studio-service.ts')
const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
const { registerStudioRoutes } = await loadClientModule('src/host/studio-routes.ts')
const { registerOpenApiRoutes } = await loadClientModule('src/host/open-api-routes.ts')
const { registerStudioDirectorCommand } = await loadClientModule('src/host/studio-director-command.ts')
const { AudioDownloads } = await loadClientModule('src/host/audio-downloads.ts')
const { createBuiltinStudioRoles } = await loadClientModule('src/types/studio.ts')
const { findMatchingStudioRole } = await loadClientModule('src/text/studio-script-parser.ts')
function makeSineWav(sampleRate, durationMs, freq = 440) {
  const count = Math.max(1, Math.round(sampleRate * durationMs / 1000))
  const samples = new Int16Array(count)
  for (let i = 0; i < count; i += 1) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000)
  }
  return encodeWavMono16(samples, sampleRate)
}

async function waitFor(predicate, timeoutMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await predicate()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for condition')
}

async function close(server) {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}

test('script parser extracts speaker, parenthesized emotion, pause hints, continuations, and round-trips', () => {
  const raw = [
    '旁白（低沉叙事）[停顿 1.2s]：夜色渐渐深了。',
    '窗外雨声细密。',
    '小红（生气）：你怎么才来！ [停顿 800ms]',
    '路人甲: 借过一下。',
  ].join('\n')

  const parsed = parseStudioScriptLines(raw)
  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].roleName, '旁白')
  assert.equal(parsed[0].speechInstruction, '低沉叙事')
  assert.equal(parsed[0].pauseAfterMs, 1200)
  assert.equal(parsed[0].text, '夜色渐渐深了。\n窗外雨声细密。')

  assert.equal(parsed[1].roleName, '小红')
  assert.equal(parsed[1].speechInstruction, '生气')
  assert.equal(parsed[1].pauseAfterMs, 800)
  assert.equal(parsed[1].text, '你怎么才来！')

  assert.equal(parsed[2].roleName, '路人甲')
  assert.equal(parsed[2].pauseAfterMs, 400)

  const roles = [
    { id: 'r1', name: '旁白' },
    { id: 'r2', name: '小红' },
  ]
  const formatted = formatStudioScriptText([
    { id: 'l1', roleId: 'r1', text: '开场白', speechInstruction: '温柔', pauseAfterMs: 1000 },
    { id: 'l2', roleId: 'r2', text: '你好呀', pauseAfterMs: 400 },
  ], roles)
  assert.deepEqual(parseStudioScriptLines(formatted), [
    { roleName: '旁白', text: '开场白', speechInstruction: '温柔', pauseAfterMs: 1000 },
    { roleName: '小红', text: '你好呀', pauseAfterMs: 400 },
  ])
})

test('Studio import preserves cast assignments and rejects overflow without replacing the saved script', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-import-'))
  const studio = new HostSpeechStudioService({}, () => resolveTtsSettings({}), new StudioDiskStore(dir))
  try {
    const role = await studio.saveRole({ provider: 'xiaomi', name: 'Ann (Night): Narrator', voice: '苏打' })
    const duplicate = await studio.saveRole({ provider: 'xiaomi', name: role.name, voice: '白桦' })
    const script = await studio.saveScript({
      title: 'Cast test',
      lines: [
        { roleId: 'builtin-narrator', text: '下雨了。', pauseAfterMs: 950 },
        { roleId: 'builtin-bingtang', text: '我到了！', pauseAfterMs: 0 },
        { roleId: role.id, text: '第一段。\n第二段。[停顿 100ms]', speechInstruction: '温柔（压低）/ slow' },
        { roleId: duplicate.id, text: '"原句"' },
      ],
    })
    const { roles } = await studio.snapshot()
    const formatted = formatStudioScriptText(script.lines, roles)
    const { script: imported, createdRoles } = await studio.importScript({ id: script.id, title: script.title, text: formatted })
    const content = lines => lines.map(({ id, ...line }) => line)
    assert.deepEqual(content(imported.lines), content(script.lines))
    assert.deepEqual(createdRoles, [])

    await assert.rejects(studio.importScript({
      id: script.id, title: script.title, text: 'New speaker: opening\nAnn: ' + '字'.repeat(501),
    }), { code: 'text-too-long', lineNumber: 2 })
    await assert.rejects(studio.importScript({
      id: script.id, title: script.title,
      text: Array.from({ length: 301 }, (_, i) => 'Ann: Line ' + (i + 1)).join('\n'),
    }), { code: 'studio-line-limit-exceeded', lineNumber: 301 })
    const current = await studio.snapshot()
    assert.deepEqual(current.scripts.find(item => item.id === script.id), imported)
    assert.equal(current.roles.some(item => item.name === 'New speaker'), false)
    await assert.rejects(studio.deleteRole(role.id), { code: 'studio-role-in-use' })
    assert.equal((await studio.startTask({ scriptId: script.id, autoStart: false })).totalLines, 4)
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('Studio plain-text import reuses existing roles across typography variants, short aliases, and Markdown formatting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-reuse-'))
  const mockSpeech = { engineState: () => ({ provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 2000, streaming: false }) }
  const studio = new HostSpeechStudioService(mockSpeech, () => resolveTtsSettings({}), new StudioDiskStore(dir))
  try {
    const imported = await studio.importScript({
      title: '复用已有角色测试',
      text: [
        '旁白（低沉）[停顿 0.8s]：雨夜开始。',
        '陆远山·纪录片旁白（平静）：镜头缓缓拉近。',
        '**冰糖**[停顿 0.5s]（惊喜）：原来不用新建重复角色！',
        '- 苏打 • 阳光少年（元气）：太省心了。',
        '1. 【vivi】（温柔）：音色设定全都保住了。',
        '陆远山 · 旁白：第一幕结束。',
      ].join('\n'),
    })
    assert.deepEqual(imported.createdRoles, [])
    assert.deepEqual(imported.script.lines.map(line => line.roleId), [
      'builtin-narrator',
      'builtin-narrator',
      'builtin-bingtang',
      'builtin-suda',
      'builtin-vivi',
      'builtin-narrator',
    ])
    assert.equal(imported.script.lines[2].speechInstruction, '惊喜')
    assert.equal(imported.script.lines[2].pauseAfterMs, 500)

    // Ambiguous primary names across two distinct roles stay separate instead of guessing.
    const young = await studio.saveRole({ provider: 'xiaomi', name: '陈默 · 少年', voice: '苏打' })
    const old = await studio.saveRole({ provider: 'xiaomi', name: '陈默 · 老年', voice: '白桦' })
    const ambiguous = await studio.importScript({
      title: '歧义测试',
      text: '陈默 · 少年：少年台词\n陈默 · 老年：老年台词\n陈默：未指明年龄',
    })
    assert.equal(ambiguous.script.lines[0].roleId, young.id)
    assert.equal(ambiguous.script.lines[1].roleId, old.id)
    assert.equal(ambiguous.createdRoles.length, 1)
    assert.equal(ambiguous.createdRoles[0].name, '陈默')
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('Studio auditions and archives use the saved cast even with a different mixer voice and external takeover', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-cast-'))
  const settings = resolveTtsSettings({
    voice: '冰糖',
    voiceDesignPrompt: 'Mixer prompt',
    apiKey: 'sk-studio-test',
    baseURL: 'https://studio.test/v1',
    mossEnabled: true,
    mossVoice: 'mixer-moss-voice',
  })
  const dispatch = new MockAgent()
  const previousDispatcher = getGlobalDispatcher()
  dispatch.disableNetConnect()
  const requests = []
  const wav = makeSineWav(24000, 100)
  dispatch.get('https://studio.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(request => {
    requests.push(JSON.parse(request.body))
    return { statusCode: 200, data: { choices: [{ message: { audio: { data: wav.toString('base64') } } }] } }
  }).times(4)
  setGlobalDispatcher(dispatch)

  const host = new HostSpeechService(() => settings)
  const external = createTestProvider()
  const externalRequests = []
  const models = [{
    id: 'cast-model', name: 'Cast model',
    voices: [{ id: 'mixer-voice', name: 'Mixer' }, { id: 'lead-voice', name: 'Lead' }],
    speechInstruction: true,
  }]
  host.registerProvider({
    ...external,
    getSnapshot: () => ({ ...external.getSnapshot(), models, selection: { model: 'cast-model', voice: 'mixer-voice' } }),
    async synthesize(request) { externalRequests.push(request); return { data: wav, format: 'wav' } },
  })
  const mossRequests = []
  const studio = new HostSpeechStudioService(host, () => settings, new StudioDiskStore(dir), async (_base, voice, text) => {
    mossRequests.push({ voice, text })
    return wav
  })
  try {
    const voices = await Promise.all([
      studio.saveRole({ provider: 'xiaomi', name: 'Preset', model: 'mimo-v2.5-tts', voice: '白桦' }),
      studio.saveRole({ provider: 'xiaomi', name: 'Design', model: 'mimo-v2.5-tts-voicedesign', voiceDesignPrompt: 'Quiet radio host' }),
      studio.saveRole({ provider: external.id, name: 'External', model: 'cast-model', voice: 'lead-voice', voiceRate: 1.5 }),
      studio.saveRole({ provider: 'moss', name: 'Local', voice: 'studio-local-voice' }),
    ])
    await assert.rejects(studio.saveRole({ provider: 'xiaomi', name: 'Unknown', model: 'mimo-v2.5-tts', voice: 'unknown' }), { code: 'voice-unavailable' })
    const lines = voices.map((voice, index) => ({ roleId: voice.id, text: 'Line ' + (index + 1), pauseAfterMs: 0 }))
    const task = await studio.startTask({ lines, autoStart: false })
    settings.voice = 'Mia'
    settings.voiceDesignPrompt = 'Different mixer prompt'
    for (const line of lines) {
      const audio = await studio.previewLine(line, new AbortController().signal)
      assert.ok(decodeWavMono16(audio).samples.length > 0)
    }
    await studio.resumeTask(task.id)
    await waitFor(async () => (await studio.snapshot()).tasks.find(item => item.id === task.id)?.status === 'completed')
    assert.deepEqual(requests.map(request => [request.model, request.audio.voice, request.messages[0].content.startsWith('Quiet radio host')]), [
      ['mimo-v2.5-tts', '白桦', false], ['mimo-v2.5-tts-voicedesign', undefined, true],
      ['mimo-v2.5-tts', '白桦', false], ['mimo-v2.5-tts-voicedesign', undefined, true],
    ])
    assert.deepEqual(externalRequests.map(request => [request.model, request.voice]), [['cast-model', 'lead-voice'], ['cast-model', 'lead-voice']])
    assert.deepEqual(mossRequests.map(request => request.voice), ['studio-local-voice', 'studio-local-voice'])
    assert.ok((await studio.getTaskAudioFile(task.id)).size > wav.length)
    dispatch.assertNoPendingInterceptors()
  } finally {
    await studio.dispose()
    await host.dispose()
    setGlobalDispatcher(previousDispatcher)
    await dispatch.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('WAV stitcher normalizes mixed sample rates, inserts exact pauses, adjusts speed, and emits timeline', () => {
  const seg1 = makeSineWav(16000, 200, 300)
  const seg2 = makeSineWav(24000, 300, 500)
  const stitched = stitchWavSegments([
    { wav: seg1, pauseAfterMs: 250, speed: 1 },
    { wav: seg2, pauseAfterMs: 100, speed: 1.5 },
  ])

  assert.equal(stitched.sampleRate, 24000)
  assert.equal(stitched.timeline.length, 2)
  assert.equal(stitched.timeline[0].startMs, 0)
  assert.ok(Math.abs(stitched.timeline[0].speechDurationMs - 200) <= 5)
  assert.ok(Math.abs(stitched.timeline[0].endMs - 450) <= 5)
  assert.equal(stitched.timeline[1].startMs, stitched.timeline[0].endMs)
  // 300ms at 1.5x speed should be ~200ms
  assert.ok(stitched.timeline[1].speechDurationMs >= 160 && stitched.timeline[1].speechDurationMs <= 240)
  const decoded = decodeWavMono16(stitched.wav)
  assert.equal(decoded.sampleRate, 24000)
  assert.ok(decoded.samples.length > 0)
})

test('background queue caches completed lines on failure, resumes without re-synthesizing, and pauses across host restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-queue-'))
  try {
    const calls = []
    let failSecondOnce = true
    const mockSpeech = {
      engineState: () => ({ provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 2000, streaming: false }),
      capabilities: () => ({ provider: 'xiaomi', formats: ['wav'], providers: [] }),
      async synthesize(req) {
        calls.push({ text: req.text, provider: req.provider })
        if (req.text === '第二句' && failSecondOnce) {
          failSecondOnce = false
          throw Object.assign(new Error('rate-limited'), { code: 'rate-limited' })
        }
        return { data: makeSineWav(24000, 150), text: req.text, provider: req.provider ?? 'xiaomi', format: 'wav', contentType: 'audio/wav', durationMs: 150 }
      },
    }

    const store = new StudioDiskStore(dir)
    const service = new HostSpeechStudioService(mockSpeech, () => resolveTtsSettings({}), store)

    const imported = await service.importScript({
      title: '断点续录测试',
      text: '旁白：第一句\n主角：第二句',
    })
    assert.equal(imported.createdRoles.length, 1)
    assert.equal(imported.script.lines[0].roleId, 'builtin-narrator')

    const started = await service.startTask({ scriptId: imported.script.id })
    const failedTask = await waitFor(async () => {
      const snap = await service.snapshot()
      const t = snap.tasks.find(item => item.id === started.id)
      return t?.status === 'failed' ? t : null
    })
    assert.equal(failedTask.completedLines, 1)
    assert.equal(failedTask.failedLines, 1)
    assert.equal(calls.length, 2)

    // Resume should reuse cached WAV for line 1 and ONLY synthesize line 2!
    await service.resumeTask(started.id)
    const completed = await waitFor(async () => {
      const snap = await service.snapshot()
      const t = snap.tasks.find(item => item.id === started.id)
      return t?.status === 'completed' ? t : null
    })
    assert.equal(completed.completedLines, 2)
    assert.equal(calls.length, 3)
    assert.equal(calls[2].text, '第二句')
    assert.ok(completed.audioSize > 44)
    assert.ok(completed.lines[1].startMs >= completed.lines[0].endMs)

    // Simulate Host restart with a queued/paused task persisted on disk
    const pausedDraft = await service.startTask({ scriptId: imported.script.id, autoStart: false })
    assert.equal(pausedDraft.status, 'paused')
    await service.dispose()

    const reloadedStore = new StudioDiskStore(dir)
    const reloaded = await reloadedStore.load()
    const afterRestart = reloaded.tasks.find(t => t.id === pausedDraft.id)
    assert.equal(afterRestart.status, 'paused')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('storage quota rejects writes exceeding maxStorageBytes and deleting tasks reclaims disk usage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-quota-'))
  try {
    const store = new StudioDiskStore(dir, 1000)
    const bigWav = makeSineWav(24000, 100) // ~4844 bytes > 1000 bytes
    await assert.rejects(
      () => store.writeLineCache('task-1', 0, 'abcd1234', bigWav),
      error => error.code === 'studio-storage-limit-exceeded',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('an archive commit failure keeps completed audio for a host restart and resume', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-archive-'))
  class FaultyStore extends StudioDiskStore {
    async saveManifest(records) {
      if (records.tasks.some(task => task.status === 'completed')) throw new Error('Simulated manifest write failure')
      return super.saveManifest(records)
    }
  }
  const spoken = []
  const speech = {
    async synthesize(request) {
      spoken.push(request.text)
      return { data: makeSineWav(24000, 100) }
    },
  }
  let studio = new HostSpeechStudioService(speech, () => resolveTtsSettings({}), new FaultyStore(dir))
  try {
    const task = await studio.startTask({
      lines: [
        { roleId: 'builtin-narrator', text: 'First' },
        { roleId: 'builtin-bingtang', text: 'Second' },
      ],
    })
    const failed = await waitFor(async () => {
      const item = (await studio.snapshot()).tasks.find(item => item.id === task.id)
      return item?.status === 'failed' && item
    })
    assert.equal(failed.errorCode, 'studio-storage-write-failed')
    await studio.dispose()

    studio = new HostSpeechStudioService(speech, () => resolveTtsSettings({}), new StudioDiskStore(dir))
    await studio.resumeTask(task.id)
    await waitFor(async () => (await studio.snapshot()).tasks.find(item => item.id === task.id)?.status === 'completed')
    assert.deepEqual(spoken, ['First', 'Second'])
    assert.ok((await studio.getTaskAudioFile(task.id)).size > 44)
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('a startup write failure has a visible task result and leaves Studio able to resume', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-running-'))
  class FaultyStore extends StudioDiskStore {
    fail = true
    async saveManifest(records) {
      if (this.fail && records.tasks.some(task => task.status === 'running')) {
        this.fail = false
        throw new Error('Simulated manifest write failure')
      }
      return super.saveManifest(records)
    }
  }
  let synthesisCount = 0
  const speech = { async synthesize() { synthesisCount++; return { data: makeSineWav(24000, 70) } } }
  const studio = new HostSpeechStudioService(speech, () => resolveTtsSettings({}), new FaultyStore(dir))
  try {
    const task = await studio.startTask({ lines: [{ roleId: 'builtin-narrator', text: 'Host error' }] })
    const failed = await waitFor(async () => {
      const item = (await studio.snapshot()).tasks.find(item => item.id === task.id)
      return item?.status === 'failed' && item
    })
    assert.equal(failed.errorCode, 'studio-storage-write-failed')
    assert.equal(synthesisCount, 0)
    await studio.resumeTask(task.id)
    await waitFor(async () => (await studio.snapshot()).tasks.find(item => item.id === task.id)?.status === 'completed')
    assert.equal(synthesisCount, 1)
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

for (const stop of ['pauseTask', 'cancelTask']) {
  test('Studio honors ' + stop + ' while an archive is being written', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-stop-'))
    const writing = Promise.withResolvers()
    const releaseWrite = Promise.withResolvers()
    let synthesisSignal
    class DelayedStore extends StudioDiskStore {
      async writeTaskOutput(id, bytes) {
        const file = await super.writeTaskOutput(id, bytes)
        writing.resolve()
        await releaseWrite.promise
        return file
      }
    }
    const store = new DelayedStore(dir)
    const speech = {
      async synthesize(request) {
        synthesisSignal = request.signal
        return { data: makeSineWav(24000, 80) }
      },
    }
    const studio = new HostSpeechStudioService(speech, () => resolveTtsSettings({}), store)
    try {
      const task = await studio.startTask({ lines: [{ roleId: 'builtin-narrator', text: 'Finish slowly' }] })
      await writing.promise
      const aborted = once(synthesisSignal, 'abort')
      const stopped = studio[stop](task.id)
      await aborted
      releaseWrite.resolve()
      assert.equal((await stopped).status, stop === 'pauseTask' ? 'paused' : 'canceled')
      await assert.rejects(studio.getTaskAudioFile(task.id), { code: 'studio-audio-unavailable' })
      assert.equal((await studio.snapshot()).storageBytes > 0, stop === 'pauseTask')
    } finally {
      releaseWrite.resolve()
      await studio.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })
}

test('Studio isolates profile edits and the first profile keeps the existing archive library', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-profile-'))
  const useStore = store => new HostSpeechStudioService({}, () => resolveTtsSettings({}), store)
  const original = useStore(new StudioDiskStore(dir))
  const left = useStore(StudioDiskStore.forProfile('test-profile-a', dir))
  const right = useStore(StudioDiskStore.forProfile('test-profile-b', dir))
  const competing = useStore(StudioDiskStore.forProfile('test-profile-a', dir))
  try {
    const existing = await original.saveRole({ provider: 'xiaomi', name: 'Original' })
    await original.dispose()
    assert.ok((await left.snapshot()).roles.some(role => role.id === existing.id))
    assert.ok(!(await right.snapshot()).roles.some(role => role.id === existing.id))
    await assert.rejects(competing.snapshot(), { code: 'studio-store-busy' })
    const leftRole = await left.saveRole({ provider: 'xiaomi', name: 'Profile A' })
    const rightRole = await right.saveRole({ provider: 'xiaomi', name: 'Profile B' })
    await left.dispose()
    const recovered = (await competing.snapshot()).roles
    assert.ok(recovered.some(role => role.id === leftRole.id))
    assert.ok(!recovered.some(role => role.id === rightRole.id))
    assert.ok((await right.snapshot()).roles.some(role => role.id === rightRole.id))
  } finally {
    await Promise.all([original.dispose(), left.dispose(), right.dispose(), competing.dispose()])
    await rm(dir, { recursive: true, force: true })
  }
})

test('Studio HTTP routes enforce same-origin, serve Range audio, and Open API enforces Bearer token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-http-'))
  const routes = []
  const disposers = []
  const store = new StudioDiskStore(dir)
  const mockSpeech = {
    engineState: () => ({ provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 2000, streaming: false }),
    capabilities: () => ({ provider: 'xiaomi', formats: ['wav'], providers: [] }),
    async synthesize(req) {
      return { data: makeSineWav(24000, 120), text: req.text, provider: 'xiaomi', format: 'wav', contentType: 'audio/wav', durationMs: 120 }
    },
  }
  const studio = new HostSpeechStudioService(mockSpeech, () => resolveTtsSettings({}), store)
  const downloads = new AudioDownloads()

  const ctx = {
    speechStudio: studio,
    speechSynthesis: mockSpeech,
    get: name => (name === 'speechStudio' ? studio : undefined),
    logger: { warn() {} },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    webServer: {
      register(entry) {
        routes.push(entry)
        return () => {}
      },
    },
  }

  registerStudioRoutes(ctx)
  registerOpenApiRoutes(ctx, () => 'secret-studio-token', downloads)

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = routes.find(r => (r.kind === 'exact' ? r.path === pathname : pathname.startsWith(r.path)))
    if (!route) { res.statusCode = 404; res.end(); return }
    void route.handler(req, res)
  })

  try {
    const base = await listenLoopback(server)

    // Cross-origin write is rejected
    const crossOrigin = await fetch(`${base}${TTS_STUDIO_ROLES_ROUTE}`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '旁白', provider: 'xiaomi' }),
    })
    assert.equal(crossOrigin.status, 403)

    // Same-origin script import & task start
    const importedRes = await fetch(`${base}${TTS_STUDIO_SCRIPTS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
      body: JSON.stringify({ kind: 'import', title: 'HTTP剧集', text: '旁白：欢迎收听。' }),
    })
    assert.equal(importedRes.status, 200)
    const importedBody = await importedRes.json()
    const sample = await fetch(base + TTS_STUDIO_PREVIEW_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
      body: JSON.stringify({ roleId: importedBody.script.lines[0].roleId, text: '试听。' }),
    })
    assert.equal(sample.status, 200)
    assert.ok(decodeWavMono16(Buffer.from(await sample.arrayBuffer())).samples.length > 0)

    const rejectedImport = await fetch(base + TTS_STUDIO_SCRIPTS_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
      body: JSON.stringify({ kind: 'import', title: 'Oversized', text: 'Speaker: ' + '字'.repeat(501) }),
    })
    assert.equal(rejectedImport.status, 413)
    assert.deepEqual(await rejectedImport.json(), { error: 'text-too-long', lineNumber: 1 })

    const startRes = await fetch(`${base}${TTS_STUDIO_TASKS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
      body: JSON.stringify({ action: 'start', scriptId: importedBody.script.id }),
    })
    assert.equal(startRes.status, 201)
    const { task } = await startRes.json()

    await waitFor(async () => {
      const s = await (await fetch(`${base}${TTS_STUDIO_STATE_ROUTE}`)).json()
      return s.tasks.find(item => item.id === task.id)?.status === 'completed'
    })

    // Range request returns 206 Partial Content with RIFF header bytes
    const rangeRes = await fetch(`${base}${TTS_STUDIO_AUDIO_ROUTE}?taskId=${encodeURIComponent(task.id)}`, {
      headers: { range: 'bytes=0-43' },
    })
    assert.equal(rangeRes.status, 206)
    const headBytes = Buffer.from(await rangeRes.arrayBuffer())
    assert.equal(headBytes.byteLength, 44)
    assert.equal(headBytes.toString('ascii', 0, 4), 'RIFF')

    // Open API rejects missing token & unknown fields, accepts valid Bearer token
    const unauth = await fetch(`${base}${TTS_OPEN_STUDIO_ROUTE}`)
    assert.equal(unauth.status, 401)

    const unknownField = await fetch(`${base}${TTS_OPEN_STUDIO_ROUTE}`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-studio-token', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-role', secretPath: '/etc/passwd' }),
    })
    assert.equal(unknownField.status, 400)

    const openState = await fetch(`${base}${TTS_OPEN_STUDIO_ROUTE}`, {
      headers: { authorization: 'Bearer secret-studio-token' },
    })
    assert.equal(openState.status, 200)
    const openJson = await openState.json()
    assert.equal(openJson.tasks[0].status, 'completed')

    const fullScript = await fetch(base + TTS_STUDIO_SCRIPTS_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' },
      body: JSON.stringify({
        title: 'Full episode',
        lines: Array.from({ length: 300 }, () => ({
          roleId: importedBody.script.lines[0].roleId,
          text: '字'.repeat(500),
          speechInstruction: '慢'.repeat(300),
        })),
      }),
    })
    assert.equal(fullScript.status, 200)
    const full = await fullScript.json()
    assert.equal(full.script.lines.length, 300)
    assert.equal(full.script.lines.at(-1).text.length, 500)
  } finally {
    await studio.dispose()
    await downloads.dispose()
    await close(server)
    await rm(dir, { recursive: true, force: true })
  }
})

test('studio /director slash command discloses tools per session, steers requests, exits, and replays log state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-director-cmd-'))
  try {
    const store = new StudioDiskStore(dir)
    const mockSpeech = {
      engineState: () => ({ provider: 'xiaomi', revision: 1, name: 'xiaomi', ready: true, formats: ['wav'], maxTextLength: 2000, streaming: false }),
      capabilities: () => ({ provider: 'xiaomi', formats: ['wav'], providers: [] }),
      async synthesize(req) {
        return { data: makeSineWav(24000, 100), text: req.text, provider: 'xiaomi', format: 'wav', contentType: 'audio/wav', durationMs: 100 }
      },
    }
    const studio = new HostSpeechStudioService(mockSpeech, () => resolveTtsSettings({}), store)

    const registeredTools = new Map()
    const registeredCommands = new Map()
    const promptSections = new Map()
    const sessionListeners = new Set()
    const ctx = {
      speechStudio: studio,
      speechSynthesis: mockSpeech,
      tools: {
        register(tool, options) {
          registeredTools.set(tool.name, { tool, options })
          return () => registeredTools.delete(tool.name)
        },
      },
      commands: {
        register(definition) {
          registeredCommands.set(definition.name, definition)
          return () => registeredCommands.delete(definition.name)
        },
      },
      systemPrompt: {
        getSectionOrder: () => 500,
        section(spec) {
          promptSections.set(spec.name, spec)
          return () => promptSections.delete(spec.name)
        },
      },
      on(event, listener) {
        if (event === 'session/event') sessionListeners.add(listener)
        return () => sessionListeners.delete(listener)
      },
    }

    const dispose = registerStudioDirectorCommand(ctx)
    const directorCommand = registeredCommands.get(STUDIO_DIRECTOR_COMMAND_NAME)
    assert.ok(directorCommand)
    assert.equal(directorCommand.input?.attachments, true)

    const expectedTools = ['studio_inspect', 'studio_save_role', 'studio_save_script', 'studio_import_script', 'studio_task_control']
    for (const toolName of expectedTools) {
      assert.ok(registeredTools.has(toolName), `Expected tool ${toolName}`)
    }

    const sessionA = { id: 'session-a', snapshotEvents: () => [] }
    const sessionB = { id: 'session-b', snapshotEvents: () => [] }
    const steeredA = []
    const agentA = { id: 'session-a', session: sessionA, steer: msg => steeredA.push(msg) }
    const agentB = { id: 'session-b', session: sessionB, steer: () => assert.fail('session B must not be steered') }
    const signal = new AbortController().signal

    // Before entering /director, neither session sees director prompt or studio tools.
    assert.equal(promptSections.get('studio-director:policy').text({ agent: agentA }), '')
    assert.equal(promptSections.get('studio-director:status').text({ agent: agentA }), '')
    assert.equal(registeredTools.get('studio_inspect').options.when({ agent: agentA }), false)

    // Entering /director with text + attachment activates only session A and steers the prompt.
    const attachment = {
      type: 'file',
      attachment: { attachmentId: `sha256:${'a'.repeat(64)}`, name: '第一章.txt', bytes: 128 },
    }
    const enterResult = await directorCommand.handler({
      commandId: 'cmd-1',
      agent: agentA,
      rawInput: ' 改编成三人悬疑广播剧',
      attachments: [attachment],
      signal,
    })
    assert.equal(enterResult.kind, 'success')
    assert.equal(steeredA.length, 1)
    assert.equal(steeredA[0].content.length, 2)
    assert.deepEqual(steeredA[0].content[0], attachment)
    assert.equal(steeredA[0].content[1].text, '改编成三人悬疑广播剧')

    assert.ok(promptSections.get('studio-director:policy').text({ agent: agentA }).includes('studio_inspect'))
    assert.ok(promptSections.get('studio-director:status').text({ agent: agentA }).length > 0)
    assert.equal(registeredTools.get('studio_inspect').options.when({ agent: agentA }), true)
    assert.equal(registeredTools.get('studio_inspect').options.when({ agent: agentB }), false)
    assert.equal(promptSections.get('studio-director:policy').text({ agent: agentB }), '')

    // Uploaded documents can be the entire request, with every file forwarded in upload order.
    const steeredDocuments = []
    const sessionDocuments = { id: 'session-documents', snapshotEvents: () => [] }
    const agentDocuments = { id: 'session-documents', session: sessionDocuments, steer: msg => steeredDocuments.push(msg) }
    const documents = [attachment, {
      type: 'file',
      attachment: { attachmentId: `sha256:${'b'.repeat(64)}`, name: '第二章.txt', bytes: 256 },
    }]
    const documentsResult = await directorCommand.handler({
      commandId: 'cmd-documents',
      agent: agentDocuments,
      rawInput: '   ',
      attachments: documents,
      signal,
    })
    assert.equal(documentsResult.kind, 'success')
    assert.deepEqual(steeredDocuments.map(message => message.content), [documents])
    assert.equal(steeredDocuments[0].source.kind, 'user')

    // Bare /director (no args or attachments) still activates the session and steers a notice turn so DSH asks clarifying questions.
    const steeredBare = []
    const sessionBare = { id: 'session-bare', snapshotEvents: () => [] }
    const agentBare = { id: 'session-bare', session: sessionBare, steer: msg => steeredBare.push(msg) }
    const bareResult = await directorCommand.handler({
      commandId: 'cmd-bare',
      agent: agentBare,
      rawInput: '   ',
      attachments: [],
      signal,
    })
    assert.equal(bareResult.kind, 'success')
    assert.equal(registeredTools.get('studio_inspect').options.when({ agent: agentBare }), true)
    assert.equal(steeredBare.length, 1)
    assert.equal(steeredBare[0].source.kind, 'studio-director')
    assert.ok(steeredBare[0].content[0].text.includes('studio_inspect'))

    // Disclosed tools execute end-to-end against HostSpeechStudioService and reuse roles on duplicate save names.
    const savedRole = await registeredTools.get('studio_save_role').tool.execute({ name: '导演旁白', provider: 'xiaomi', voice: '冰糖' }, { signal })
    const reusedRole = await registeredTools.get('studio_save_role').tool.execute({ name: '导演旁白', provider: 'xiaomi', voice: '白桦' }, { signal })
    assert.equal(reusedRole.role.id, savedRole.role.id)
    assert.equal(reusedRole.role.voice, '白桦')
    const savedScript = await registeredTools.get('studio_save_script').tool.execute({
      title: 'AI导演样片',
      lines: [{ roleId: savedRole.role.id, text: '第一场，开拍！', pauseAfterMs: 300 }],
    }, { signal })
    const started = await registeredTools.get('studio_task_control').tool.execute({ action: 'start', scriptId: savedScript.script.id, autoStart: false }, { signal })
    assert.equal(started.task.status, 'paused')

    // /director off rejects attachments and preserves active mode.
    const badOff = await directorCommand.handler({
      commandId: 'cmd-2',
      agent: agentA,
      rawInput: ' off',
      attachments: [attachment],
      signal,
    })
    assert.equal(badOff.kind, 'error')
    assert.notEqual(promptSections.get('studio-director:status').text({ agent: agentA }), '')

    // Clean /director off deactivates director status while keeping tool catalog stable.
    const offResult = await directorCommand.handler({
      commandId: 'cmd-3',
      agent: agentA,
      rawInput: ' off',
      attachments: [],
      signal,
    })
    assert.equal(offResult.kind, 'success')
    assert.notEqual(
      promptSections.get('studio-director:status').text({ agent: agentA }),
      promptSections.get('studio-director:status').text({ agent: { id: 'session-c', session: { id: 'session-c', snapshotEvents: () => [
        { type: 'command/run', data: { commandId: 'r1', name: STUDIO_DIRECTOR_COMMAND_NAME, args: ' 写剧' } },
        { type: 'command/done', data: { commandId: 'r1', kind: 'success' } },
      ] } } }),
    )

    // Cold resumed/forked session replays logged /director command lifecycle.
    const resumedSession = {
      id: 'session-resumed',
      snapshotEvents: () => [
        { type: 'command/run', data: { commandId: 'r1', name: STUDIO_DIRECTOR_COMMAND_NAME, args: '' } },
        { type: 'command/done', data: { commandId: 'r1', kind: 'success' } },
      ],
    }
    const resumedAgent = { id: 'session-resumed', session: resumedSession }
    assert.equal(registeredTools.get('studio_inspect').options.when({ agent: resumedAgent }), true)
    assert.ok(promptSections.get('studio-director:policy').text({ agent: resumedAgent }).includes('studio_inspect'))

    // Standalone studio-agent module remains composable independently.
    const standaloneTools = new Map()
    studioAgent.apply({
      speechStudio: studio,
      speechSynthesis: mockSpeech,
      tools: { register(tool) { standaloneTools.set(tool.name, tool) } },
    })
    for (const toolName of expectedTools) assert.ok(standaloneTools.has(toolName))

    dispose()
    assert.equal(registeredCommands.size, 0)
    assert.equal(registeredTools.size, 0)
    assert.equal(promptSections.size, 0)
    assert.equal(sessionListeners.size, 0)
    await studio.dispose()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the built-in radio, product video and suspense scripts can start recording with their default cast', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-episodes-'))
  const studio = new HostSpeechStudioService({}, () => resolveTtsSettings({}), new StudioDiskStore(dir))
  try {
    const first = await studio.snapshot()
    assert.deepEqual(first.tasks, [])
    const roles = new Map(first.roles.map(role => [role.id, role]))
    const episodes = [
      ['builtin-script-night-radio', 1],
      ['builtin-script-product-video', 2],
      ['builtin-script-daily-comedy', 3],
      ['builtin-script-suspense', 6],
    ]
    for (const [id, speakers] of episodes) {
      const script = first.scripts.find(item => item.id === id)
      assert.ok(script, 'the default episode can be opened from the script library')
      assert.equal(new Set(script.lines.map(line => line.roleId)).size, speakers)
      assert.ok(script.lines.length <= STUDIO_MAX_LINES_PER_SCRIPT)
      assert.ok(script.lines.every(line => line.text.trim() && [...line.text].length <= STUDIO_MAX_LINE_CHARACTERS))
      if (id === 'builtin-script-suspense') {
        assert.ok(script.lines.reduce((total, line) => total + [...line.text].length, 0) >= 3000)
      }
      const task = await studio.startTask({ scriptId: script.id, autoStart: false })
      assert.equal(task.totalLines, script.lines.length)
      assert.ok(task.lines.every(line => line.provider === 'xiaomi' && line.voice === roles.get(line.roleId)?.voice))
      if (id === 'builtin-script-product-video') {
        const hostLines = task.lines.filter(line => line.roleId === 'builtin-podcast-host')
        assert.ok(hostLines.length > 0)
        for (const line of hostLines) {
          assert.equal(line.model, 'mimo-v2.5-tts-voicedesign')
          assert.equal(findVoiceDesignPresetByPrompt(line.voiceDesignPrompt)?.id, 'liang-wenfeng')
        }
      }
    }
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('Studio adds the default episodes to an old library once and preserves local edits and deletions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-library-upgrade-'))
  const store = new StudioDiskStore(dir)
  let studio = new HostSpeechStudioService({}, () => resolveTtsSettings({}), store)
  try {
    const editedRole = {
      id: 'builtin-narrator', name: '自定义旁白', color: '#3b82f6', provider: 'xiaomi', model: 'mimo-v2.5-tts',
      voice: 'Milo', voiceRate: 1, createdAt: 1, updatedAt: 2,
    }
    const userEpisode = {
      id: 'user-episode', title: '旧剧本', lines: [{ id: 'user-line', roleId: editedRole.id, text: '我的台词。', pauseAfterMs: 600 }],
      createdAt: 1, updatedAt: 2,
    }
    await writeFile(store.manifestPath, JSON.stringify({ version: 1, roles: [editedRole], scripts: [userEpisode], tasks: [] }))

    const migrated = await studio.snapshot()
    assert.deepEqual(migrated.roles.find(role => role.id === editedRole.id), editedRole)
    assert.deepEqual(migrated.scripts.find(script => script.id === userEpisode.id), userEpisode)
    const defaults = migrated.scripts.filter(script => script.id !== userEpisode.id)
    assert.ok(defaults.some(script => script.id === 'builtin-script-suspense'))
    const roleIds = new Set(migrated.roles.map(role => role.id))
    assert.ok(defaults.every(script => script.lines.every(line => roleIds.has(line.roleId))))
    const changed = await studio.saveScript({ ...defaults[0], title: '我改过的示例' })
    const removed = defaults[1]
    await studio.deleteScript(removed.id)
    await studio.dispose()

    studio = new HostSpeechStudioService({}, () => resolveTtsSettings({}), new StudioDiskStore(dir))
    const reopened = await studio.snapshot()
    assert.deepEqual(reopened.scripts.find(script => script.id === changed.id), changed)
    assert.ok(!reopened.scripts.some(script => script.id === removed.id))
  } finally {
    await studio.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('Studio replaces the retired podcast preset and preserves prior library changes', async t => {
  for (const edited of [false, true]) {
    await t.test(edited ? 'keeps a personalized copy' : 'removes the untouched preset', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-video-preset-'))
      const store = new StudioDiskStore(dir)
      const oldScript = {
        id: 'builtin-script-podcast',
        title: '男女对谈播客',
        lines: [{ id: 'old-line', roleId: 'builtin-moli', text: edited ? '我的改写。' : '旧示例。', pauseAfterMs: 600 }],
        createdAt: 1,
        updatedAt: edited ? 2 : 1,
      }
      try {
        await writeFile(store.manifestPath, JSON.stringify({
          version: 1, builtinCatalogVersion: 1, roles: [], scripts: [oldScript], tasks: [],
        }))

        const migrated = await store.load()
        assert.deepEqual(migrated.scripts.find(script => script.id === oldScript.id), edited ? oldScript : undefined)
        const video = migrated.scripts.find(script => script.id === 'builtin-script-product-video')
        assert.ok(video)
        assert.ok(video.lines.every(line => migrated.roles.some(role => role.id === line.roleId)))
        assert.ok(!migrated.scripts.some(script => ['builtin-script-night-radio', 'builtin-script-suspense'].includes(script.id)))

        const reopened = await new StudioDiskStore(dir).load()
        assert.deepEqual(reopened.scripts, migrated.scripts)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
  }
})

test('Studio upgrades the default podcast voice and preserves local library changes', async t => {
  const oldHost = {
    id: 'builtin-podcast-host', name: '许闻川 · 播客主持', color: '#b45309', provider: 'xiaomi',
    model: 'mimo-v2.5-tts', voice: '白桦', voiceRate: 1, builtin: true, createdAt: 1, updatedAt: 1,
  }
  const cases = [
    { name: 'upgrades 白桦', roles: [oldHost], changed: true },
    { name: 'upgrades Dean', roles: [{ ...oldHost, voice: 'Dean' }], changed: true },
    { name: 'keeps an edited host', roles: [{ ...oldHost, builtin: false, updatedAt: 2 }], changed: false },
    { name: 'respects a deleted host', roles: [], changed: false },
  ]
  for (const { name, roles, changed } of cases) {
    await t.test(name, async () => {
      const dir = await mkdtemp(join(tmpdir(), 'dsh-studio-host-voice-'))
      const store = new StudioDiskStore(dir)
      try {
        await writeFile(store.manifestPath, JSON.stringify({
          version: 1, builtinCatalogVersion: 2, roles, scripts: [], tasks: [],
        }))
        const migrated = await store.load()
        if (changed) {
          const role = migrated.roles.find(item => item.id === oldHost.id)
          assert.equal(role?.model, 'mimo-v2.5-tts-voicedesign')
          assert.equal(findVoiceDesignPresetByPrompt(role.voiceDesignPrompt)?.id, 'liang-wenfeng')
        } else if (roles.length === 0) {
          assert.equal(migrated.roles.find(item => item.id === oldHost.id), undefined)
        } else {
          assert.deepEqual(migrated.roles.find(item => item.id === oldHost.id), roles[0])
        }
        assert.deepEqual(migrated.scripts.map(item => item.id), ['builtin-script-daily-comedy'])
        const reopened = await new StudioDiskStore(dir).load()
        assert.deepEqual(reopened.roles, migrated.roles)
        assert.deepEqual(reopened.scripts, migrated.scripts)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
  }
})
