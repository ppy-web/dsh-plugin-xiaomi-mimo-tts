import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { createElement } from 'react'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { renderCompleted } from './helpers/render-completed.mjs'

const { normalizeMossBaseURL } = await loadClientModule('src/moss.ts')
const { apply: applyPassport, Config: PassportConfig } = await loadClientModule('src/passport.ts')
const { apply: applyPlugin, Config: PluginConfig } = await loadClientModule('src/index.ts')
const { PASSPORT_ASR_TEST_ROUTE } = await loadClientModule('src/types/passport.ts')
const { TTS_API_KEY_STATUS_ROUTE } = await loadClientModule('src/constants.ts')
const {
  prepareTtsText,
  prepareXiaomiTtsText,
  stableSpeechMarkdown,
} = await loadClientModule('src/text/normalize.ts')
const { isKnownXiaomiAudioTag, stripXiaomiAudioTags } = await loadClientModule('src/text/xiaomi-audio-tags.ts')
const { findFencedCodeRegions, removeFencedCode } = await loadClientModule('src/text/fenced-code.ts')
const { splitDeepseekText } = await loadClientModule('src/text/deepseek-limit.ts')
const { SettingsCard } = await loadClientModule('src/client/settings/card.tsx')
const { AudioHistory } = await loadClientModule('src/client/history/audio-history.ts')
const {
  API_KEY_BY_PROVIDER,
  EMPTY_DRAFT,
  editApiKeyDraft,
  hasPendingProviderKey,
} = await loadClientModule('src/client/settings/draft.ts')
const { default: GeneratedVoiceAvatar } = await loadClientModule('src/client/settings/controls/generated-voice-avatar.tsx')

function startRouteServer(routes) {
  const server = createServer((req, res) => {
    const handler = routes.get(new URL(req.url, 'http://localhost').pathname)
    if (handler) void Promise.resolve(handler(req, res)).catch(error => { res.statusCode = 500; res.end(String(error)) })
    else { res.statusCode = 404; res.end() }
  })
  return server
}

test('MOSS baseURL normalizer trims trailing slashes and rejects unsafe URLs', () => {
  assert.equal(normalizeMossBaseURL('http://127.0.0.1:7860///'), 'http://127.0.0.1:7860')
  assert.equal(normalizeMossBaseURL('https://moss.local/v1/'), 'https://moss.local/v1')
  for (const bad of ['', '   ', 'ftp://127.0.0.1:7860', 'file:///etc/passwd', 'http://user:pass@127.0.0.1:7860', 'not a url']) {
    assert.throws(() => normalizeMossBaseURL(bad), { message: 'moss-invalid-url' })
  }
})

test('Passport ASR test endpoint enforces the 4-request concurrency limit with HTTP 429', async () => {
  const routes = new Map()
  const disposers = []
  let active = 0
  let notifyStarted = null
  const mockSpeechToText = {
    snapshot: () => ({ selection: { providerId: 'mock' }, providers: [{ id: 'mock', preparation: { phase: 'ready' } }] }),
    resolve: ({ audio }) => ({ audio }),
    transcribe(_request, signal) {
      active += 1
      notifyStarted?.()
      return new Promise((_, reject) => {
        if (signal.aborted) { reject(new Error('aborted')); return }
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    },
  }
  const webServer = {
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  }
  const child = {
    effect(factory) { disposers.push(factory()) },
    webServer,
    get: service => (service === 'speechToText' ? mockSpeechToText : undefined),
    on: () => () => {},
  }
  const ctx = {
    effect(factory) { disposers.push(factory()) },
    get: child.get,
    on: () => () => {},
    inject(deps, handler) {
      if (deps.length === 1 && deps[0] === 'webServer') handler(child)
    },
  }

  applyPassport(ctx, PassportConfig({ asrProvider: 'host' }))
  const server = startRouteServer(routes)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}${PASSPORT_ASR_TEST_ROUTE}`

  const started4 = new Promise(resolve => {
    notifyStarted = () => { if (active === 4) resolve() }
  })
  const inflight = Array.from({ length: 4 }, () => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
    body: JSON.stringify({ source: 'host' }),
  }))

  try {
    await started4
    const fifth = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({ source: 'host' }),
    })
    assert.equal(fifth.status, 429)
    assert.equal((await fifth.json()).error, 'passport-asr-rate-limited')
  } finally {
    for (const dispose of disposers.splice(0).reverse()) dispose?.()
    await Promise.allSettled(inflight)
    await new Promise(resolve => server.close(resolve))
  }
})

test('/api-key-status rejects cross-origin requests, invalid methods, and unknown providers', async () => {
  const routes = new Map()
  const disposers = []
  const ctx = {
    effect(factory) { disposers.push(factory()) },
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => routes.delete(route.path)
      },
    },
    inject() {},
    on: () => () => {},
  }
  applyPlugin(ctx, PluginConfig({ provider: 'xiaomi', apiKey: 'sk-1234567890abcdef' }))
  const server = startRouteServer(routes)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}${TTS_API_KEY_STATUS_ROUTE}`

  try {
    const crossOrigin = await fetch(url, { headers: { origin: 'https://evil.example' } })
    assert.equal(crossOrigin.status, 403)
    assert.equal((await crossOrigin.json()).error, 'cross-origin-denied')

    const post = await fetch(url, { method: 'POST', headers: { 'x-dsh-speech-adapter': '1' } })
    assert.equal(post.status, 405)
    assert.equal((await post.json()).error, 'method-not-allowed')

    const bogus = await fetch(`${url}?provider=not-a-provider`)
    assert.equal(bogus.status, 400)
    assert.equal((await bogus.json()).error, 'invalid-provider')

    const valid = await fetch(`${url}?provider=xiaomi`)
    assert.equal(valid.status, 200)
    assert.deepEqual(await valid.json(), { provider: 'xiaomi', configured: true, supported: true })
  } finally {
    for (const dispose of disposers.splice(0).reverse()) dispose?.()
    await new Promise(resolve => server.close(resolve))
  }
})

test('text normalization stays bounded against adversarial ReDoS inputs', () => {
  const inputs = [
    '['.repeat(20_000) + 'a',
    '('.repeat(20_000) + 'a',
    '*'.repeat(20_000) + 'a',
    '!['.repeat(10_000),
  ]
  const started = performance.now()
  for (const input of inputs) {
    const out = prepareTtsText(input)
    assert.equal(typeof out, 'string')
  }
  const elapsed = performance.now() - started
  assert.ok(elapsed < 1000, `expected linear normalization, took ${elapsed.toFixed(1)}ms`)
})

test('Xiaomi audio tag helpers recognize uppercase English cues', () => {
  assert.equal(isKnownXiaomiAudioTag('(HAPPY)'), true)
  assert.equal(isKnownXiaomiAudioTag('[SIGH, EXCITED]'), true)
  assert.equal(stripXiaomiAudioTags('Hello (HAPPY) world!', true).replace(/\s+/gu, ' ').trim(), 'Hello world!')
  assert.match(prepareXiaomiTtsText('(HAPPY) Hello', isKnownXiaomiAudioTag), /^\(HAPPY\)\s*Hello$/u)
})

test('fenced code detection handles list-inline code blocks without dropping following prose', () => {
  const sample = ['- ```js', '  const a = 1', '  ```', 'After list.'].join('\n')
  const { regions } = findFencedCodeRegions(sample)
  assert.equal(regions.length, 1)
  const stripped = removeFencedCode(sample)
  assert.ok(!stripped.includes('const a = 1'))
  assert.ok(stripped.includes('After list.'))
})

test('streaming markdown stabilization holds back unfinished inline math and tags', () => {
  assert.equal(stableSpeechMarkdown('Hello $a'), 'Hello ')
  assert.equal(stableSpeechMarkdown('Hello $a$ next'), 'Hello $a$ next')
  assert.equal(stableSpeechMarkdown('Hello <em'), 'Hello ')
  assert.equal(stableSpeechMarkdown('Hello <em data="1\n'), 'Hello ')
  assert.equal(stableSpeechMarkdown('Hello <em>hi</em>'), 'Hello <em>hi</em>')
})

test('splitDeepseekText keeps decimal numbers intact near maximum length', () => {
  const text = 'The ratio is 3.14159 and stops.'
  const parts = splitDeepseekText(text, 16)
  assert.ok(parts.length >= 2)
  assert.ok(!parts.some(part => /3\.$/u.test(part.trim())), `unexpected decimal split: ${JSON.stringify(parts)}`)
  assert.equal(parts.join(''), text)
})

test('SettingsCard renders without SSR layout-effect warnings and clears emptied API key drafts', async () => {
  const snapshot = { status: 'ready', value: resolveTtsSettings({}), writable: true, user: {}, base: {} }
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const history = new AudioHistory({ load: async () => [], replace: async () => {}, close() {} })
  const errors = []
  const originalError = console.error
  console.error = (...args) => errors.push(args.map(arg => String(arg)).join(' '))
  let html = ''
  try {
    html = await renderCompleted(createElement(SettingsCard, {
      view: 'page',
      scope,
      history,
      t: key => key,
      controller: { play() {}, update() {} },
    }))
  } finally {
    console.error = originalError
    history.dispose()
  }

  assert.equal(errors.some(line => line.includes('useLayoutEffect')), false, `unexpected SSR warnings: ${errors.join('\n')}`)
  assert.ok(html.includes('xmimo-tts-card'))

  const entered = editApiKeyDraft(EMPTY_DRAFT, 'xiaomi', 'sk-temp-key')
  assert.equal(entered.changes[API_KEY_BY_PROVIDER.xiaomi]?.kind, 'set')
  assert.equal(hasPendingProviderKey(entered.changes, entered.keys, 'xiaomi'), true)

  const cleared = editApiKeyDraft(entered, 'xiaomi', '')
  assert.equal(cleared.changes[API_KEY_BY_PROVIDER.xiaomi], undefined)
  assert.equal(hasPendingProviderKey(cleared.changes, cleared.keys, 'xiaomi'), false)
})

function decodeAvatarSvg(html) {
  const match = /src="data:image\/svg\+xml;utf8,([^"]+)"/u.exec(html)
  assert.ok(match, `expected embedded SVG data URI in: ${html}`)
  return decodeURIComponent(match[1])
}

test('GeneratedVoiceAvatar renders every selectable style as an independent image', async () => {
  const voice = { id: 'mimo-default', provider: 'xiaomi', model: 'mimo-v2.5-tts' }
  const styles = ['default', 'pastel', 'sunrise']
  const images = await Promise.all(styles.map(async avatarStyle => {
    const html = await renderCompleted(createElement(GeneratedVoiceAvatar, { voice, label: 'MiMo', avatarStyle }))
    const svg = decodeAvatarSvg(html)
    assert.match(svg, /<svg\b/u)
    return svg
  }))
  assert.equal(new Set(images).size, styles.length)
})
