import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { DEFAULT_TTS_SETTINGS, prepareTtsText, TTS_FORMATS, TTS_MODELS, TTS_ROUTE, TTS_SETTINGS_NAMESPACE, TTS_STREAM_ROUTE, TTS_UNINSTALL_ROUTE, TTS_VOICE_DESIGN_ASSET_ROUTE, TTS_VOICE_DESIGN_PRESETS } from './shared.js'

const packageJson = createRequire(import.meta.url)('../package.json') as { version?: unknown }
const USER_AGENT = typeof packageJson.version === 'string'
  ? `dsh-xiaomi-tts/${packageJson.version}`
  : 'dsh-xiaomi-tts'
const PACKAGE_NAME = 'dsh-xiaomi-tts'
const WEB_PROFILE_NAME = 'web'

/** Cordis plugin identifier. */
export const name = 'xiaomi-mimo-tts'

/** Host services required by this plugin. */
export const inject = ['webServer']

/** Settings namespace registered with the DSH Host. */
export const XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE = settingsNamespace(TTS_SETTINGS_NAMESPACE)

/** Validated Host settings schema. */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_TTS_SETTINGS.enabled),
  apiKey: z.string().role('secret').default(DEFAULT_TTS_SETTINGS.apiKey),
  baseURL: z.string().default(DEFAULT_TTS_SETTINGS.baseURL),
  model: z.union(TTS_MODELS).default(DEFAULT_TTS_SETTINGS.model),
  voice: z.string().default(DEFAULT_TTS_SETTINGS.voice),
  voiceDesignPrompt: z.string().default(DEFAULT_TTS_SETTINGS.voiceDesignPrompt),
  voiceDesignCustomPrompt: z.string().default(DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt),
  presetStylePrompt: z.string().default(DEFAULT_TTS_SETTINGS.presetStylePrompt),
  format: z.union(TTS_FORMATS).default(DEFAULT_TTS_SETTINGS.format),
  autoPlay: z.boolean().default(DEFAULT_TTS_SETTINGS.autoPlay),
  instruction: z.string().default(DEFAULT_TTS_SETTINGS.instruction),
  maxTextLength: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxTextLength),
  requestTimeoutMs: z.number().step(1).min(1000).default(DEFAULT_TTS_SETTINGS.requestTimeoutMs),
})

export type Config = ReturnType<typeof Config>

interface SynthesizeBody {
  text?: unknown
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

interface ProfileManifest {
  dependencies?: Record<string, string>
}

interface CommandResult {
  ok: boolean
  output: string
  error?: string
}

function webProfileDirectory(): string {
  const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(dshHome, 'profiles', WEB_PROFILE_NAME)
}

function readWebProfileManifest(): ProfileManifest | undefined {
  const path = join(webProfileDirectory(), 'package.json')
  if (!existsSync(path)) return undefined
  try {
    const source = readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')
    return JSON.parse(source) as ProfileManifest
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

function uninstallFromWebProfile(): Promise<CommandResult> {
  const manifest = readWebProfileManifest()
  if (manifest === undefined) {
    return Promise.resolve({ ok: false, output: '', error: 'DSH Web profile manifest was not found or could not be read.' })
  }
  if (!Object.hasOwn(manifest.dependencies ?? {}, PACKAGE_NAME)) {
    return Promise.resolve({ ok: false, output: '', error: `${PACKAGE_NAME} is not installed as a Web profile dependency.` })
  }

  const dsh = resolveDshCommand()
  if (dsh === undefined) {
    return Promise.resolve({ ok: false, output: '', error: 'Could not resolve the running DSH executable.' })
  }

  return new Promise((resolve) => {
    const child = spawn(dsh.command, [
      ...dsh.args,
      'plugin',
      '--profile',
      WEB_PROFILE_NAME,
      'remove',
      PACKAGE_NAME,
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

  installSettingsSection(ctx, XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE, Config, config, {
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
      if (value.format !== 'mp3' && value.format !== 'wav') {
        throw new Error('format must be mp3 or wav')
      }
    },
  })

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
      const options = current()

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
      const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs)

      try {
        const endpoint = `${normalizeBaseURL(options.baseURL)}/chat/completions`
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
            model: options.model,
            messages: requestMessages(options, text),
            audio: options.model === 'mimo-v2.5-tts-voicedesign'
              ? { format: options.format }
              : { format: options.format, voice: options.voice },
            stream: false,
          }),
          signal: controller.signal,
        })

        let parsed: XiaomiAudioResponse | undefined
        try {
          parsed = await response.json() as XiaomiAudioResponse
        } catch {
          parsed = undefined
        }

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

        let audio: Buffer
        try {
          audio = Buffer.from(audioBase64, 'base64')
        } catch {
          json(res, 502, {
            error: 'invalid-audio-base64',
            message: 'Xiaomi MiMo returned invalid Base64 audio data',
          })
          return
        }

        if (audio.byteLength === 0) {
          json(res, 502, {
            error: 'empty-audio',
            message: 'Xiaomi MiMo returned an empty audio payload',
          })
          return
        }

        res.statusCode = 200
        res.setHeader('content-type', options.format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
        res.setHeader('content-length', String(audio.byteLength))
        res.setHeader('cache-control', 'no-store')
        res.end(audio)
      } catch (error) {
        const aborted = controller.signal.aborted
        json(res, aborted ? 504 : 502, {
          error: aborted ? 'xiaomi-timeout' : 'xiaomi-request-failed',
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  }), 'xiaomi-mimo-tts: synthesis route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_STREAM_ROUTE,
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
      const options = current()
      if (text.length === 0) {
        json(res, 400, { error: 'text-required' })
        return
      }
      if (text.length > options.maxTextLength) {
        json(res, 413, { error: 'text-too-long', maxTextLength: options.maxTextLength })
        return
      }
      if (options.apiKey.trim().length === 0) {
        json(res, 409, { error: 'api-key-not-configured' })
        return
      }
      if (options.model !== 'mimo-v2.5-tts') {
        json(res, 409, { error: 'streaming-model-unsupported', message: 'Realtime PCM streaming requires mimo-v2.5-tts.' })
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs)
      const abortOnDisconnect = () => controller.abort()
      req.once('aborted', abortOnDisconnect)
      res.once('close', abortOnDisconnect)

      try {
        const response = await fetch(`${normalizeBaseURL(options.baseURL)}/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${options.apiKey.trim()}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({
            model: options.model,
            messages: requestMessages(options, text),
            audio: { format: 'pcm16', voice: options.voice },
            stream: true,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          let parsed: XiaomiAudioResponse | undefined
          try {
            parsed = await response.json() as XiaomiAudioResponse
          } catch {
            parsed = undefined
          }
          json(res, response.status, { error: 'xiaomi-api-error', message: apiErrorMessage(response.status, parsed) })
          return
        }
        if (response.body === null) {
          json(res, 502, { error: 'invalid-xiaomi-response', message: 'Xiaomi MiMo streaming response had no body.' })
          return
        }

        res.statusCode = 200
        res.setHeader('content-type', response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.setHeader('x-accel-buffering', 'no')
        const reader = response.body.getReader()
        try {
          while (!res.destroyed) {
            const chunk = await reader.read()
            if (chunk.done) break
            res.write(chunk.value)
          }
        } finally {
          reader.releaseLock()
        }
        if (!res.destroyed) res.end()
      } catch (error) {
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
      }
    },
  }), 'xiaomi-mimo-tts: streaming synthesis route')
}
