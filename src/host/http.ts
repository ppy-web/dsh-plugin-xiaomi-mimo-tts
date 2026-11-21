import type { IncomingMessage, ServerResponse } from 'node:http'
import { TTS_DESKTOP_WRITE_HEADER } from '../constants.js'

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

const MAX_REQUEST_BODY_BYTES = 128 * 1024

export async function readJsonBody(req: IncomingMessage, limit: number = MAX_REQUEST_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  // Returning early from the default iterator destroys the request/socket before
  // the route can send a 413 response. Leave it open and drain rejected bodies.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > limit) {
      req.resume()
      throw new Error('request-body-too-large')
    }
    chunks.push(bytes)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function normalizeBaseURL(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/** Restrict browser management routes to the host origin and approved desktop writes. */
export function sameOriginRequest(req: IncomingMessage, write = false): boolean {
  const headers = req.headers ?? {}
  const origin = headers.origin
  let allowed = origin === undefined && (!write || (headers['sec-fetch-site'] === undefined && headers[TTS_DESKTOP_WRITE_HEADER] === '1'))
  if (origin !== undefined) {
    try {
      const url = new URL(origin)
      allowed = ['http:', 'https:'].includes(url.protocol) && url.host === headers.host
    } catch { allowed = false }
  }
  return allowed && !['cross-site', 'same-site'].includes(String(headers['sec-fetch-site']))
}

export function isJsonContentType(req: IncomingMessage): boolean {
  const value = req.headers?.['content-type']
  return typeof value === 'string' && value.split(';')[0]!.trim().toLowerCase() === 'application/json'
}

type LimitedBodyResponse = {
  body: ReadableStream<Uint8Array> | {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>
      cancel(reason?: unknown): Promise<unknown>
      releaseLock(): void
    }
  } | null
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

export async function readLimitedResponseBytes(
  response: LimitedBodyResponse,
  limit: number,
  createLimitError: () => Error = () => new Error('response-too-large'),
): Promise<Buffer> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > limit) throw createLimitError()
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      if (!next.value) continue
      const chunk = Buffer.from(next.value)
      total += chunk.length
      if (total > limit) {
        await reader.cancel().catch(() => {})
        throw createLimitError()
      }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks, total)
  } finally {
    reader.releaseLock()
  }
}

export async function readLimitedResponseText(response: LimitedBodyResponse, limit: number): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    return Buffer.byteLength(text) > limit ? new TextDecoder().decode(Buffer.from(text).subarray(0, limit)) : text
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      if (!next.value) continue
      const chunk = Buffer.from(next.value)
      const remaining = limit - total
      if (chunk.length > remaining) {
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
        await reader.cancel().catch(() => {})
        break
      }
      chunks.push(chunk)
      total += chunk.length
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks))
  } finally {
    reader.releaseLock()
  }
}
