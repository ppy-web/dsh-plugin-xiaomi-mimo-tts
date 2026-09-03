import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-host-webserver'
import * as settingsApi from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { debugConsole } from './debug-console.js'
import { installSettingsSectionCompat, resolveSettingsNamespace, type SettingsModuleCompat } from './settings-compat.js'
import { DEFAULT_TTS_SETTINGS, isNewerTtsVersion, isSupportedTtsApiKey, prepareTtsText, resolveTtsBaseURL, strictBase64DecodedLength, TTS_API_KEY_STATUS_ROUTE, TTS_API_KEY_WHALE_ASSET_ROUTE, TTS_AUDIO_RESPONSE_JSON_OVERHEAD_BYTES, TTS_FORMATS, TTS_LOCAL_SPEECH_MODES, TTS_MIXER_WHALE_ASSET_ROUTE, TTS_MODELS, TTS_PREVIEW_WHALE_ASSET_ROUTE, TTS_ROUTE, TTS_SETTINGS_NAMESPACE, TTS_STREAM_ROUTE, TTS_TOGGLE_AUDIO_ASSET_ROUTE, TTS_TOGGLE_CHARACTER_ASSET_ROUTE, TTS_TOGGLE_SOUND_FILES, TTS_UNINSTALL_ROUTE, TTS_UPDATE_ROUTE, TTS_VERSION, TTS_VOICE_ASSET_ROUTE, TTS_VOICE_DESIGN_ASSET_ROUTE, TTS_VOICE_DESIGN_PLAYBACK_MODES, TTS_VOICE_DESIGN_PRESETS, TTS_VOICE_PRESETS, TTS_VOICES } from './shared.js'

const compatibleSettingsApi = settingsApi as unknown as SettingsModuleCompat
const packageJson = createRequire(import.meta.url)('../package.json') as { version?: unknown }
const USER_AGENT = typeof packageJson.version === 'string'
  ? `dsh-xiaomi-tts/${packageJson.version}`
  : 'dsh-xiaomi-tts'
const PACKAGE_NAME = 'dsh-xiaomi-tts'
const WEB_PROFILE_NAME = 'web'
const NPM_LATEST_URL = 'https://registry.npmjs.org/dsh-xiaomi-tts/latest'
const STREAM_HOST_LOG = '[MiMoTTS Host]'
let nextHostStreamRequestId = 1

/** Cordis plugin identifier. */
export const name = 'xiaomi-mimo-tts'

/** Host services required by this plugin. */
export const inject = ['webServer']

/** Settings namespace registered with the DSH Host. */
export const XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE = resolveSettingsNamespace(compatibleSettingsApi, TTS_SETTINGS_NAMESPACE)

/** Validated Host settings schema. */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_TTS_SETTINGS.enabled),
  apiKey: z.string().role('secret').default(DEFAULT_TTS_SETTINGS.apiKey),
  baseURL: z.string().default(DEFAULT_TTS_SETTINGS.baseURL),
  model: z.union(TTS_MODELS).default(DEFAULT_TTS_SETTINGS.model),
  localSpeechMode: z.union(TTS_LOCAL_SPEECH_MODES).default(DEFAULT_TTS_SETTINGS.localSpeechMode),
  localVoiceURI: z.string().default(DEFAULT_TTS_SETTINGS.localVoiceURI),
  voice: z.string().default(DEFAULT_TTS_SETTINGS.voice),
  voiceDesignPrompt: z.string().default(DEFAULT_TTS_SETTINGS.voiceDesignPrompt),
  voiceDesignCustomPrompt: z.string().default(DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt),
  presetStylePrompt: z.string().default(DEFAULT_TTS_SETTINGS.presetStylePrompt),
  format: z.union(TTS_FORMATS).default(DEFAULT_TTS_SETTINGS.format),
  voiceDesignPlaybackMode: z.union(TTS_VOICE_DESIGN_PLAYBACK_MODES).default(DEFAULT_TTS_SETTINGS.voiceDesignPlaybackMode),
  autoPlay: z.boolean().default(DEFAULT_TTS_SETTINGS.autoPlay),
  instruction: z.string().default(DEFAULT_TTS_SETTINGS.instruction),
  maxTextLength: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxTextLength),
  requestTimeoutMs: z.number().step(1).min(1000).default(DEFAULT_TTS_SETTINGS.requestTimeoutMs),
  maxMp3AudioBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxMp3AudioBytes),
  maxWavAudioBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxWavAudioBytes),
  maxPausedPcmBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxPausedPcmBytes),
})

export type Config = ReturnType<typeof Config>

interface SynthesizeBody {
  text?: unknown
  /** Segmented VoiceDesign playback requests WAV for reliable per-segment decoding. */
  format?: unknown
  /** Optional, validated overrides used by the settings-card preview. */
  model?: unknown
  voice?: unknown
  voiceDesignPrompt?: unknown
}

interface XiaomiAudioResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: unknown
      }
    }
  }>
  error?: string | { message?: string }
  message?: string
}

function requestMessages(options: Config, text: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const context = options.model === 'mimo-v2.5-tts-voicedesign'
    ? options.voiceDesignPrompt.trim()
    : [options.presetStylePrompt.trim(), options.instruction.trim()].filter((item) => item.length > 0).join('\n')
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  if (context.length > 0) messages.push({ role: 'user', content: context })
  messages.push({ role: 'assistant', content: text })
  return messages
}

function upstreamModel(options: Config): 'mimo-v2.5-tts' | 'mimo-v2.5-tts-voicedesign' {
  return options.model === 'mimo-v2.5-tts-voicedesign' ? options.model : 'mimo-v2.5-tts'
}

function synthesisOptions(options: Config, body: SynthesizeBody): Config {
  const model = TTS_MODELS.includes(body.model as typeof TTS_MODELS[number])
    ? body.model as typeof TTS_MODELS[number]
    : options.model
  const voice = TTS_VOICES.includes(body.voice as typeof TTS_VOICES[number])
    ? body.voice as typeof TTS_VOICES[number]
    : options.voice
  const voiceDesignPrompt = typeof body.voiceDesignPrompt === 'string' && body.voiceDesignPrompt.trim().length > 0
    ? body.voiceDesignPrompt
    : options.voiceDesignPrompt
  return { ...options, model, voice, voiceDesignPrompt }
}

const MAX_REQUEST_BODY_BYTES = 128 * 1024

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > limit) throw new Error('request-body-too-large')
    chunks.push(bytes)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, '')
}

function apiErrorMessage(status: number, parsed: XiaomiAudioResponse | undefined): string {
  const detail = typeof parsed?.error === 'string'
    ? parsed.error
    : parsed?.error?.message ?? parsed?.message
  return detail && detail.length > 0
    ? detail
    : `Xiaomi MiMo TTS request failed (HTTP ${status})`
}

type CompleteAudioAbortReason = 'client-disconnect' | 'timeout' | null

class CompleteAudioResponseError extends Error {
  constructor(readonly code: 'xiaomi-response-too-large' | 'invalid-audio-base64' | 'audio-too-large' | 'invalid-audio-format') {
    super(code)
  }
}

type CompleteAudioFormat = 'mp3' | 'wav'

function completeAudioFormat(options: Config): CompleteAudioFormat {
  return options.format === 'wav' ? 'wav' : 'mp3'
}

function completeAudioLimit(options: Config, format: CompleteAudioFormat): number {
  return format === 'mp3' ? options.maxMp3AudioBytes : options.maxWavAudioBytes
}

function completeAudioJsonLimit(audioLimit: number): number {
  return 4 * Math.ceil(audioLimit / 3) + TTS_AUDIO_RESPONSE_JSON_OVERHEAD_BYTES
}

async function readLimitedXiaomiResponse(response: Response, limit: number, controller: AbortController): Promise<XiaomiAudioResponse | undefined> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > limit) {
    controller.abort()
    throw new CompleteAudioResponseError('xiaomi-response-too-large')
  }
  if (response.body === null) return undefined

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) {
        controller.abort()
        throw new CompleteAudioResponseError('xiaomi-response-too-large')
      }
      chunks.push(Buffer.from(chunk.value))
    }
  } finally {
    reader.releaseLock()
  }
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as XiaomiAudioResponse
  } catch {
    return undefined
  }
}

function decodeCompleteAudio(value: string, format: CompleteAudioFormat, limit: number): Buffer {
  const expectedLength = strictBase64DecodedLength(value)
  if (expectedLength === null) throw new CompleteAudioResponseError('invalid-audio-base64')
  if (expectedLength > limit) throw new CompleteAudioResponseError('audio-too-large')

  const audio = Buffer.from(value, 'base64')
  if (audio.byteLength !== expectedLength) throw new CompleteAudioResponseError('invalid-audio-base64')
  const validFormat = format === 'wav'
    ? audio.byteLength >= 12 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE'
    : audio.byteLength >= 2 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xFF && (audio[1]! & 0xE0) === 0xE0))
  if (!validFormat) throw new CompleteAudioResponseError('invalid-audio-format')
  return audio
}

interface CommandResult {
  ok: boolean
  output: string
  error?: string
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

function webProfileDirectory(): string {
  const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(dshHome, 'profiles', WEB_PROFILE_NAME)
}

function readWebProfileManifest(): ProfileManifest | undefined {
  const path = join(webProfileDirectory(), 'package.json')
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as ProfileManifest
  } catch {
    return undefined
  }
}

function resolveDshCommand(): { command: string; args: string[] } | undefined {
  const entry = process.argv[1]
  if (typeof entry === 'string' && /[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/iu.test(entry)) {
    return { command: process.execPath, args: [entry] }
  }

  const executable = process.execPath.split(/[\\/]/u).at(-1) ?? ''
  if (/^dsh(?:\.exe)?$/iu.test(executable)) return { command: process.execPath, args: [] }
  return undefined
}

async function latestTtsVersion(): Promise<string | null> {
  try {
    const response = await fetch(NPM_LATEST_URL, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return null
    const body = await response.json() as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  }
}

function scheduleProfileLinkCleanup(profileRoot: string): Promise<void> {
  const cleanupScript = String.raw`
const { lstatSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const [parentPidSource, profileRoot, packageName] = process.argv.slice(1)
const parentPid = Number(parentPidSource)
const linkPath = join(profileRoot, 'node_modules', packageName)
let cleanupAttempts = 0

function cleanupLink() {
  cleanupAttempts += 1
  try {
    const item = lstatSync(linkPath)
    if (!item.isSymbolicLink()) process.exit(2)
    rmSync(linkPath, { force: true })
    process.exit(0)
  } catch (error) {
    if (error && error.code === 'ENOENT') process.exit(0)
    if (cleanupAttempts >= 40) process.exit(1)
    setTimeout(cleanupLink, 500)
  }
}

function waitForParentExit() {
  try {
    process.kill(parentPid, 0)
    setTimeout(waitForParentExit, 1000)
  } catch {
    cleanupLink()
  }
}

waitForParentExit()
`

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', cleanupScript, String(process.pid), profileRoot, PACKAGE_NAME], {
      cwd: profileRoot,
      env: { ...process.env, CI: 'true' },
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function uninstallFromWebProfile(): Promise<CommandResult> {
  const manifest = readWebProfileManifest()
  if (manifest === undefined) {
    return { ok: false, output: '', error: 'DSH Web profile manifest was not found or could not be read.' }
  }
  const installed = Object.hasOwn(manifest.dependencies ?? {}, PACKAGE_NAME)
    || manifest.dsh?.profile?.bundles?.includes(PACKAGE_NAME) === true
  if (!installed) {
    try {
      await scheduleProfileLinkCleanup(webProfileDirectory())
      return { ok: true, output: 'The plugin was already removed from the Web profile; link cleanup is scheduled after this process exits.' }
    } catch (error) {
      return { ok: false, output: '', error: error instanceof Error ? error.message : String(error) }
    }
  }

  const dsh = resolveDshCommand()
  if (dsh === undefined) {
    return { ok: false, output: '', error: 'Could not resolve the running DSH executable.' }
  }

  const result = await new Promise<CommandResult>((resolve) => {
    const child = spawn(dsh.command, [
      ...dsh.args,
      'plugin',
      '--profile',
      WEB_PROFILE_NAME,
      'remove',
      PACKAGE_NAME,
      '--lockfile-only',
    ], {
      cwd: webProfileDirectory(),
      env: { ...process.env, CI: 'true' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { output += chunk })
    child.stderr?.on('data', (chunk: string) => { output += chunk })
    child.once('error', (error) => {
      resolve({ ok: false, output: output.trim(), error: error.message })
    })
    child.once('close', (code) => {
      resolve({
        ok: code === 0,
        output: output.trim(),
        ...(code === 0 ? {} : { error: `DSH plugin removal exited with code ${String(code)}.` }),
      })
    })
  })

  if (!result.ok) return result
  const updatedManifest = readWebProfileManifest()
  if (updatedManifest === undefined
    || Object.hasOwn(updatedManifest.dependencies ?? {}, PACKAGE_NAME)
    || updatedManifest.dsh?.profile?.bundles?.includes(PACKAGE_NAME) === true) {
    return { ok: false, output: result.output, error: 'DSH did not remove the plugin from the Web profile.' }
  }

  try {
    await scheduleProfileLinkCleanup(webProfileDirectory())
    return { ok: true, output: result.output }
  } catch (error) {
    return { ok: false, output: result.output, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Register the TTS settings and same-origin synthesis route. */
export function apply(ctx: Context, config: Config): void {
  let current = () => config
  let uninstalling: Promise<CommandResult> | undefined

  const voicePresetAssets = new Map(TTS_VOICE_DESIGN_PRESETS.map((preset) => {
    const path = `${TTS_VOICE_DESIGN_ASSET_ROUTE}/${preset.id}.webp`
    const data = readFileSync(new URL(`../assets/voice-presets/${preset.id}.webp`, import.meta.url))
    return [path, data] as const
  }))
  const voiceAssets = new Map(TTS_VOICE_PRESETS.map((preset) => {
    const path = `${TTS_VOICE_ASSET_ROUTE}/${preset.id}.webp`
    const data = readFileSync(new URL(`../assets/voice-avatars/${preset.id}.webp`, import.meta.url))
    return [path, data] as const
  }))
  const toggleCharacterAsset = readFileSync(new URL('../assets/ui/toggle-characters.png', import.meta.url))
  const apiKeyWhaleAsset = readFileSync(new URL('../assets/ui/api-key-whale.png', import.meta.url))
  const mixerWhaleAsset = readFileSync(new URL('../assets/ui/mixer-whale.png', import.meta.url))
  const previewWhaleAsset = readFileSync(new URL('../assets/ui/preview-whale.png', import.meta.url))
  const toggleSoundAssets = new Map(Object.values(TTS_TOGGLE_SOUND_FILES).flat().map((file) => {
    const path = `${TTS_TOGGLE_AUDIO_ASSET_ROUTE}/${file}`
    const data = readFileSync(new URL(`../assets/audio/${file}`, import.meta.url))
    return [path, data] as const
  }))

  installSettingsSectionCompat(compatibleSettingsApi, ctx, XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE, Config, config, {
    setSource(source) {
      current = source
    },
    onChange() {},
    validate(value) {
      const base = normalizeBaseURL(value.baseURL)
      const endpoint = `${base}/chat/completions`
      if (!URL.canParse(endpoint)) throw new Error('baseURL must be a valid absolute URL')
      if (value.model === 'mimo-v2.5-tts-voicedesign' && value.voiceDesignPrompt.trim().length === 0) {
        throw new Error('voiceDesignPrompt is required when using mimo-v2.5-tts-voicedesign')
      }
      if (!TTS_FORMATS.includes(value.format)) {
        throw new Error('format must be pcm, mp3, or wav')
      }
    },
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_UPDATE_ROUTE,
    async handler(req, res) {
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        json(res, 405, { error: 'method-not-allowed' })
        return
      }
      const latest = await latestTtsVersion()
      json(res, 200, { currentVersion: TTS_VERSION, latestVersion: latest, updateAvailable: latest !== null && isNewerTtsVersion(latest, TTS_VERSION) })
    },
  }), 'xiaomi-mimo-tts: update status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_API_KEY_STATUS_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        json(res, 405, { error: 'method-not-allowed' })
        return
      }

      const apiKey = current().apiKey.trim()
      json(res, 200, {
        configured: apiKey.length > 0,
        supported: apiKey.length > 0 && isSupportedTtsApiKey(apiKey),
      })
    },
  }), 'xiaomi-mimo-tts: API key status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_UNINSTALL_ROUTE,
    async handler(req, res) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      const fetchSite = req.headers['sec-fetch-site']
      if (fetchSite !== undefined && fetchSite !== 'same-origin') {
        json(res, 403, { ok: false, error: 'same-origin-required' })
        return
      }
      const contentType = req.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().startsWith('application/json')) {
        json(res, 415, { ok: false, error: 'application-json-required' })
        return
      }

      try {
        await readJsonBody(req, 1024)
      } catch {
        json(res, 400, { ok: false, error: 'invalid-json' })
        return
      }

      uninstalling ??= uninstallFromWebProfile()
      const result = await uninstalling
      if (!result.ok) uninstalling = undefined
      json(res, result.ok ? 200 : 500, {
        ok: result.ok,
        requiresRestart: result.ok,
        ...(result.error === undefined ? {} : { error: result.error }),
      })
    },
  }), 'xiaomi-mimo-tts: self-uninstall route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('content-length', String(toggleCharacterAsset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : toggleCharacterAsset)
    },
  }), 'xiaomi-mimo-tts: character toggle asset')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_API_KEY_WHALE_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('content-length', String(apiKeyWhaleAsset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : apiKeyWhaleAsset)
    },
  }), 'xiaomi-mimo-tts: API key whale asset')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_MIXER_WHALE_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('content-length', String(mixerWhaleAsset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : mixerWhaleAsset)
    },
  }), 'xiaomi-mimo-tts: mixer whale asset')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_PREVIEW_WHALE_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('content-length', String(previewWhaleAsset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : previewWhaleAsset)
    },
  }), 'xiaomi-mimo-tts: preview whale asset')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: TTS_TOGGLE_AUDIO_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const asset = toggleSoundAssets.get(pathname)
      if (asset === undefined) {
        res.statusCode = 404
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'audio/mpeg')
      res.setHeader('content-length', String(asset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : asset)
    },
  }), 'xiaomi-mimo-tts: toggle sound assets')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: TTS_VOICE_DESIGN_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const asset = voicePresetAssets.get(pathname)
      if (asset === undefined) {
        res.statusCode = 404
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/webp')
      res.setHeader('content-length', String(asset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : asset)
    },
  }), 'xiaomi-mimo-tts: voice preset assets')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: TTS_VOICE_ASSET_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }

      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const asset = voiceAssets.get(pathname)
      if (asset === undefined) {
        res.statusCode = 404
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('content-type', 'image/webp')
      res.setHeader('content-length', String(asset.byteLength))
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.setHeader('x-content-type-options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : asset)
    },
  }), 'xiaomi-mimo-tts: built-in voice assets')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_ROUTE,
    async handler(req, res) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        json(res, 405, { error: 'method-not-allowed' })
        return
      }

      let body: SynthesizeBody
      try {
        body = await readJsonBody(req, MAX_REQUEST_BODY_BYTES) as SynthesizeBody
      } catch (error) {
        json(res, error instanceof Error && error.message === 'request-body-too-large' ? 413 : 400, {
          error: error instanceof Error && error.message === 'request-body-too-large'
            ? 'request-body-too-large'
            : 'invalid-json',
        })
        return
      }

      const text = typeof body.text === 'string' ? prepareTtsText(body.text) : ''
      const options = synthesisOptions(current(), body)

      if (text.length === 0) {
        json(res, 400, { error: 'text-required' })
        return
      }
      if (text.length > options.maxTextLength) {
        json(res, 413, {
          error: 'text-too-long',
          maxTextLength: options.maxTextLength,
        })
        return
      }
      if (options.apiKey.trim().length === 0) {
        json(res, 409, { error: 'api-key-not-configured' })
        return
      }

      const controller = new AbortController()
      let abortReason: CompleteAudioAbortReason = null
      const abort = (reason: Exclude<CompleteAudioAbortReason, null>): void => {
        if (controller.signal.aborted) return
        abortReason = reason
        controller.abort()
      }
      const timeout = setTimeout(() => abort('timeout'), options.requestTimeoutMs)
      const abortOnRequest = () => abort('client-disconnect')
      const abortOnResponseClose = () => {
        if (!res.writableEnded) abort('client-disconnect')
      }
      req.once('aborted', abortOnRequest)
      res.once('close', abortOnResponseClose)

      try {
        const format = body.format === 'wav' ? 'wav' : completeAudioFormat(options)
        const endpoint = `${normalizeBaseURL(resolveTtsBaseURL(options.apiKey, options.baseURL))}/chat/completions`
        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${options.apiKey.trim()}`,
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({
            model: upstreamModel(options),
            messages: requestMessages(options, text),
            audio: options.model === 'mimo-v2.5-tts-voicedesign'
              ? { format }
              : { format, voice: options.voice },
            stream: false,
          }),
          signal: controller.signal,
        })

        const audioLimit = completeAudioLimit(options, format)
        const parsed = await readLimitedXiaomiResponse(response, completeAudioJsonLimit(audioLimit), controller)

        if (!response.ok) {
          json(res, response.status, {
            error: 'xiaomi-api-error',
            message: apiErrorMessage(response.status, parsed),
          })
          return
        }

        const audioBase64 = parsed?.choices?.[0]?.message?.audio?.data
        if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
          json(res, 502, {
            error: 'invalid-xiaomi-response',
            message: 'Xiaomi MiMo response did not contain choices[0].message.audio.data',
          })
          return
        }

        const audio = decodeCompleteAudio(audioBase64, format, audioLimit)

        res.statusCode = 200
        res.setHeader('content-type', format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
        res.setHeader('content-length', String(audio.byteLength))
        res.setHeader('cache-control', 'no-store')
        res.end(audio)
      } catch (error) {
        if (abortReason === 'client-disconnect' || res.destroyed || res.writableEnded) return
        if (error instanceof CompleteAudioResponseError) {
          json(res, 502, { error: error.code, message: error.message })
          return
        }
        json(res, abortReason === 'timeout' ? 504 : 502, {
          error: abortReason === 'timeout' ? 'xiaomi-timeout' : 'xiaomi-request-failed',
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        clearTimeout(timeout)
        req.off('aborted', abortOnRequest)
        res.off('close', abortOnResponseClose)
      }
    },
  }), 'xiaomi-mimo-tts: synthesis route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STREAM_ROUTE,
    async handler(req, res) {
      const requestId = nextHostStreamRequestId++
      debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 收到流式合成请求`, { method: req.method, path: TTS_STREAM_ROUTE })
      if (req.method !== 'POST') {
        debugConsole?.warn(STREAM_HOST_LOG, `[请求 ${requestId}] 拒绝：仅支持 POST`)
        res.setHeader('allow', 'POST')
        json(res, 405, { error: 'method-not-allowed' })
        return
      }

      let body: SynthesizeBody
      try {
        body = await readJsonBody(req, MAX_REQUEST_BODY_BYTES) as SynthesizeBody
      } catch (error) {
        debugConsole?.error(STREAM_HOST_LOG, `[请求 ${requestId}] 请求体解析失败`, error)
        json(res, error instanceof Error && error.message === 'request-body-too-large' ? 413 : 400, {
          error: error instanceof Error && error.message === 'request-body-too-large'
            ? 'request-body-too-large'
            : 'invalid-json',
        })
        return
      }

      const text = typeof body.text === 'string' ? prepareTtsText(body.text) : ''
      const options = synthesisOptions(current(), body)
      debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 请求参数已解析`, {
        text,
        textLength: text.length,
        model: upstreamModel(options),
        voice: options.voice,
        apiKeyConfigured: options.apiKey.trim().length > 0,
        requestTimeoutMs: options.requestTimeoutMs,
      })
      if (text.length === 0) {
        debugConsole?.warn(STREAM_HOST_LOG, `[请求 ${requestId}] 拒绝：文本为空`)
        json(res, 400, { error: 'text-required' })
        return
      }
      if (text.length > options.maxTextLength) {
        debugConsole?.warn(STREAM_HOST_LOG, `[请求 ${requestId}] 拒绝：文本过长`, { textLength: text.length, maxTextLength: options.maxTextLength })
        json(res, 413, { error: 'text-too-long', maxTextLength: options.maxTextLength })
        return
      }
      if (options.apiKey.trim().length === 0) {
        debugConsole?.warn(STREAM_HOST_LOG, `[请求 ${requestId}] 拒绝：API Key 未配置`)
        json(res, 409, { error: 'api-key-not-configured' })
        return
      }
      if (upstreamModel(options) !== 'mimo-v2.5-tts') {
        debugConsole?.warn(STREAM_HOST_LOG, `[请求 ${requestId}] 拒绝：模型不支持 PCM 流式播放`, { model: upstreamModel(options) })
        json(res, 409, { error: 'streaming-model-unsupported', message: 'Realtime PCM streaming requires mimo-v2.5-tts.' })
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs)
      const abortOnDisconnect = () => controller.abort()
      req.once('aborted', abortOnDisconnect)
      res.once('close', abortOnDisconnect)

      try {
        debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 正在请求小米 MiMo 上游`)
        const response = await fetch(`${normalizeBaseURL(resolveTtsBaseURL(options.apiKey, options.baseURL))}/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${options.apiKey.trim()}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({
            model: upstreamModel(options),
            messages: requestMessages(options, text),
            audio: { format: 'pcm16', voice: options.voice },
            stream: true,
          }),
          signal: controller.signal,
        })
        debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 收到小米上游响应`, { ok: response.ok, status: response.status, contentType: response.headers.get('content-type') })

        if (!response.ok) {
          let parsed: XiaomiAudioResponse | undefined
          try {
            parsed = await response.json() as XiaomiAudioResponse
          } catch {
            parsed = undefined
          }
          debugConsole?.error(STREAM_HOST_LOG, `[请求 ${requestId}] 小米上游返回错误`, { status: response.status, message: apiErrorMessage(response.status, parsed) })
          json(res, response.status, { error: 'xiaomi-api-error', message: apiErrorMessage(response.status, parsed) })
          return
        }
        if (response.body === null) {
          debugConsole?.error(STREAM_HOST_LOG, `[请求 ${requestId}] 小米上游响应没有 body`)
          json(res, 502, { error: 'invalid-xiaomi-response', message: 'Xiaomi MiMo streaming response had no body.' })
          return
        }

        res.statusCode = 200
        res.setHeader('content-type', response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.setHeader('x-accel-buffering', 'no')
        const reader = response.body.getReader()
        let forwardedChunks = 0
        let forwardedBytes = 0
        try {
          while (!res.destroyed) {
            const chunk = await reader.read()
            if (chunk.done) break
            forwardedChunks += 1
            forwardedBytes += chunk.value.byteLength
            debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 转发上游数据块 #${forwardedChunks}`, { bytes: chunk.value.byteLength })
            res.write(chunk.value)
          }
        } finally {
          reader.releaseLock()
          debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 上游流读取结束`, { responseDestroyed: res.destroyed, forwardedChunks, forwardedBytes })
        }
        if (!res.destroyed) {
          res.end()
          debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 已完成浏览器响应`)
        }
      } catch (error) {
        debugConsole?.error(STREAM_HOST_LOG, `[请求 ${requestId}] 流式代理失败`, { aborted: controller.signal.aborted, error })
        if (!res.destroyed) {
          const aborted = controller.signal.aborted
          json(res, aborted ? 504 : 502, {
            error: aborted ? 'xiaomi-timeout' : 'xiaomi-request-failed',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        clearTimeout(timeout)
        req.off('aborted', abortOnDisconnect)
        res.off('close', abortOnDisconnect)
        debugConsole?.info(STREAM_HOST_LOG, `[请求 ${requestId}] 请求清理完成`, { aborted: controller.signal.aborted, responseDestroyed: res.destroyed })
      }
    },
  }), 'xiaomi-mimo-tts: streaming synthesis route')
}
