import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { DEFAULT_TTS_SETTINGS, prepareTtsText, TTS_FORMATS, TTS_MODELS, TTS_ROUTE, TTS_SETTINGS_NAMESPACE } from './shared.js'

const packageJson = createRequire(import.meta.url)('../package.json') as { version?: unknown }
const USER_AGENT = typeof packageJson.version === 'string'
  ? `dsh-xiaomi-tts/${packageJson.version}`
  : 'dsh-xiaomi-tts'

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

/** Register the TTS settings and same-origin synthesis route. */
export function apply(ctx: Context, config: Config): void {
  let current = () => config

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
        const context = options.model === 'mimo-v2.5-tts-voicedesign'
          ? [options.voiceDesignPrompt.trim(), options.instruction.trim()].filter((item) => item.length > 0).join('\n')
          : options.instruction.trim()
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
        if (context.length > 0) {
          messages.push({ role: 'user', content: context })
        }
        messages.push({ role: 'assistant', content: text })

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
            messages,
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
}
