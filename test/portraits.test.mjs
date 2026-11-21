import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { registerPortraitRoutes } = await loadClientModule('src/host/portraits.ts')
const { TTS_PORTRAITS_ROUTE, TTS_PORTRAIT_IMAGE_ROUTE } = await loadClientModule('src/constants.ts')
const { PORTRAIT_MAX_BYTES } = await loadClientModule('src/types/portrait.ts')

const VALID_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
)

async function withPortraitServer(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-portraits-'))
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
  }
  registerPortraitRoutes(ctx, root)
  const server = createServer((req, res) => {
    const handler = routes.get(new URL(req.url, 'http://localhost').pathname)
    if (handler) void handler(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
    else { res.statusCode = 404; res.end() }
  })
  try {
    // Windows may assign one of Fetch's blocked ports when listening on port zero.
    for (let attempt = 0; ; attempt += 1) {
      server.listen(randomInt(49152, 65536), '127.0.0.1')
      try { await once(server, 'listening'); break }
      catch (error) { if (error.code !== 'EADDRINUSE' || attempt >= 9) throw error }
    }
    const base = `http://127.0.0.1:${server.address().port}`
    await run({ base, root })
  } finally {
    for (const dispose of disposers.splice(0).reverse()) dispose?.()
    if (server.listening) await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
}

test('portrait library returns an empty manifest on GET and HEAD initially', async () => {
  await withPortraitServer(async ({ base }) => {
    const res = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      slots: { voice: null, autoplay: null, sound: null, provider: null },
    })

    const head = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.match(head.headers.get('content-type') ?? '', /application\/json/u)
  })
})

test('portrait upload, scale update, image fetch, and reset persist in isolated storage', async () => {
  await withPortraitServer(async ({ base }) => {
    const dataUrl = `data:image/png;base64,${VALID_PNG.toString('base64')}`
    const upload = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({ slot: 'voice', image: dataUrl, scale: 1.25 }),
    })
    assert.equal(upload.status, 200)
    const uploaded = await upload.json()
    assert.equal(uploaded.ok, true)
    assert.equal(uploaded.slots.voice.scale, 1.25)
    assert.match(uploaded.slots.voice.version, /^\d+$/u)

    const imageRes = await fetch(`${base}${TTS_PORTRAIT_IMAGE_ROUTE}?slot=voice`)
    assert.equal(imageRes.status, 200)
    assert.equal(imageRes.headers.get('content-type'), 'image/png')
    assert.equal(imageRes.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await imageRes.arrayBuffer()), VALID_PNG)

    const scaleUpdate = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({ slot: 'voice', scale: 1.75 }),
    })
    assert.equal(scaleUpdate.status, 200)
    assert.equal((await scaleUpdate.json()).slots.voice.scale, 1.75)

    const missingScale = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({ slot: 'sound', scale: 1.1 }),
    })
    assert.equal(missingScale.status, 404)
    assert.equal((await missingScale.json()).error, 'portrait-missing')

    const reset = await fetch(`${base}${TTS_PORTRAITS_ROUTE}?slot=voice`, {
      method: 'DELETE',
      headers: { 'x-dsh-speech-adapter': '1' },
    })
    assert.equal(reset.status, 200)
    assert.equal((await reset.json()).slots.voice, null)

    const afterDelete = await fetch(`${base}${TTS_PORTRAIT_IMAGE_ROUTE}?slot=voice`)
    assert.equal(afterDelete.status, 404)
    assert.equal((await afterDelete.json()).error, 'portrait-missing')
  })
})

test('portrait upload rejects payloads exceeding the 8 MB limit and invalid image types', async () => {
  await withPortraitServer(async ({ base }) => {
    const oversized = Buffer.concat([VALID_PNG.subarray(0, 8), Buffer.alloc(PORTRAIT_MAX_BYTES + 16)])
    const overRes = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({ slot: 'voice', image: `data:image/png;base64,${oversized.toString('base64')}` }),
    })
    assert.equal(overRes.status, 413)
    assert.equal((await overRes.json()).error, 'upload-too-large')

    const svgRes = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({
        slot: 'voice',
        image: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`,
      }),
    })
    assert.equal(svgRes.status, 415)
    assert.equal((await svgRes.json()).error, 'unsupported-image')

    const spoofRes = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-speech-adapter': '1' },
      body: JSON.stringify({
        slot: 'voice',
        image: `data:image/png;base64,${Buffer.from('not really png bytes').toString('base64')}`,
      }),
    })
    assert.equal(spoofRes.status, 415)
    assert.equal((await spoofRes.json()).error, 'unsupported-image')

    const csrfRes = await fetch(`${base}${TTS_PORTRAITS_ROUTE}`, {
      method: 'GET',
      headers: { origin: 'https://evil.example' },
    })
    assert.equal(csrfRes.status, 403)
    assert.equal((await csrfRes.json()).error, 'cross-origin-denied')
  })
})
