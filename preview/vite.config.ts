import { cp, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = path.resolve(previewRoot, '..')
const pluginRoute = '/plugins/xiaomi-mimo-tts/'
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/', 2)[1]
const pagesBase = process.env.GITHUB_ACTIONS === 'true' && repositoryName !== undefined
  ? `/${repositoryName}/`
  : '/'

const assetDirectories = new Map([
  ['voice-avatars', path.join(repositoryRoot, 'assets', 'voice-avatars')],
  ['voice-presets', path.join(repositoryRoot, 'assets', 'voice-presets')],
  ['audio', path.join(repositoryRoot, 'assets', 'audio')],
])

const assetFiles = new Map([
  ['mimo.svg', path.join(repositoryRoot, 'assets', 'mimo.svg')],
  ['toggle-characters.webp', path.join(repositoryRoot, 'assets', 'ui', 'toggle-characters.webp')],
  ['api-key-whale.webp', path.join(repositoryRoot, 'assets', 'ui', 'api-key-whale.webp')],
  ['mixer-whale.webp', path.join(repositoryRoot, 'assets', 'ui', 'mixer-whale.webp')],
  ['preview-whale.webp', path.join(repositoryRoot, 'assets', 'ui', 'preview-whale.webp')],
  ['sound-effects-whale.webp', path.join(repositoryRoot, 'assets', 'ui', 'sound-effects-whale.webp')],
  ['sound-effect-cues.webp', path.join(repositoryRoot, 'assets', 'ui', 'sound-effect-cues.webp')],
])

function resolvePreviewAsset(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const pathname = decodeURIComponent(url.split('?', 1)[0] ?? '')
  if (!pathname.startsWith(pluginRoute)) return undefined
  const relative = pathname.slice(pluginRoute.length)
  const direct = assetFiles.get(relative)
  if (direct !== undefined) return direct
  const separator = relative.indexOf('/')
  if (separator < 1) return undefined
  const directory = assetDirectories.get(relative.slice(0, separator))
  if (directory === undefined) return undefined
  const filename = relative.slice(separator + 1)
  if (filename !== path.basename(filename)) return undefined
  return path.join(directory, filename)
}

function contentType(filename: string): string {
  if (filename.endsWith('.svg')) return 'image/svg+xml'
  if (filename.endsWith('.png')) return 'image/png'
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.mp3')) return 'audio/mpeg'
  return 'application/octet-stream'
}

function previewAssets(): Plugin {
  return {
    name: 'xiaomi-mimo-preview-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const filename = resolvePreviewAsset(request.url)
        if (filename === undefined) return next()
        void readFile(filename).then((body) => {
          response.statusCode = 200
          response.setHeader('content-type', contentType(filename))
          response.end(body)
        }).catch(() => next())
      })
    },
    async writeBundle(options) {
      if (options.dir === undefined) return
      const destination = path.join(options.dir, pluginRoute)
      await mkdir(destination, { recursive: true })
      for (const [name, source] of assetFiles) {
        await cp(source, path.join(destination, name))
      }
      for (const [name, source] of assetDirectories) {
        await cp(source, path.join(destination, name), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  root: previewRoot,
  base: pagesBase,
  publicDir: false,
  plugins: [previewAssets()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.MIMO_TTS_DEBUG': JSON.stringify('false'),
  },
  server: {
    host: '127.0.0.1',
    open: true,
  },
  build: {
    outDir: path.join(repositoryRoot, '.preview-dist'),
    emptyOutDir: true,
  },
})
