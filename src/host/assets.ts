import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'

interface StaticAssetOptions {
  path: string
  data: Buffer
  contentType: string
  description: string
}

/** Create a handler for static asset serving with proper HTTP semantics. */
function createStaticAssetHandler(data: Buffer, contentType: string) {
  const etag = `"${createHash('sha256').update(data).digest('hex').slice(0, 16)}"`
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.setHeader('allow', 'GET, HEAD')
      res.end()
      return
    }

    const versioned = new URL(req.url ?? '/', 'http://localhost').searchParams.has('v')
    res.setHeader('etag', etag)
    res.setHeader('cache-control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, must-revalidate')
    res.setHeader('x-content-type-options', 'nosniff')
    if (req.headers?.['if-none-match'] === etag) {
      res.statusCode = 304
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('content-type', contentType)
    res.setHeader('content-length', String(data.byteLength))
    res.end(req.method === 'HEAD' ? undefined : data)
  }
}

/** Register a single static asset route. */
export function registerStaticAsset(ctx: Context, options: StaticAssetOptions): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: options.path,
    handler: createStaticAssetHandler(options.data, options.contentType),
  }), `xiaomi-mimo-tts: ${options.description}`)
}
