import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

export const name = 'xiaomi-mimo-tts'
export const inject = ['webServer']

export const XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE = settingsNamespace('xiaomi-mimo-tts')
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

export const Config = z.object({
  enabled: z.boolean().default(true),
  apiKey: z.string().role('secret').default(''),
  baseURL: z.string().default('https://api.xiaomimimo.com/v1'),
  model: z.string().default('mimo-v2.5-tts'),
  voice: z.string().default('冰糖'),
  format: z.union(['mp3', 'wav'] as const).default('mp3'),
  autoPlay: z.boolean().default(true),
  instruction: z.string().default('请用自然、清晰、语速适中的语气朗读。'),
  maxTextLength: z.number().step(1).min(1).default(12000),
  requestTimeoutMs: z.number().step(1).min(1000).default(120000),
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

export function apply(ctx: Context, config: Config): void {
  let current = () => config

  installSettingsSection(ctx, XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE, Config, config, {
    setSource(source) {
      current = source
    },
    onChange() {},
    validate(value) {
      const base = normalizeBaseURL(value.baseURL ?? 'https://api.xiaomimimo.com/v1')
      const endpoint = `${base}/chat/completions`
      if (!URL.canParse(endpoint)) throw new Error('baseURL must be a valid absolute URL')
      if (value.model !== 'mimo-v2.5-tts') {
        throw new Error('this plugin currently supports the built-in voice model mimo-v2.5-tts only')
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

      const text = typeof body.text === 'string' ? body.text.trim() : ''
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
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
        if (options.instruction.trim().length > 0) {
          messages.push({ role: 'user', content: options.instruction.trim() })
        }
        messages.push({ role: 'assistant', content: text })

        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${options.apiKey.trim()}`,
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': 'dsh-xiaomi-tts/0.1.0',
          },
          body: JSON.stringify({
            model: options.model,
            messages,
            audio: {
              format: options.format,
              voice: options.voice,
            },
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
