import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

interface StaticAssetOptions {
  path: string
  data: Buffer
  contentType: string
  description: string
}

/** Create a handler for static asset serving with proper HTTP semantics. */
function createStaticAssetHandler(data: Buffer, contentType: string) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.setHeader('allow', 'GET, HEAD')
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('content-type', contentType)
    res.setHeader('content-length', String(data.byteLength))
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    res.setHeader('x-content-type-options', 'nosniff')
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
