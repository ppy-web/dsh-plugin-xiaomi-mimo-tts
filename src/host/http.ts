import type { IncomingMessage, ServerResponse } from 'node:http'

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
