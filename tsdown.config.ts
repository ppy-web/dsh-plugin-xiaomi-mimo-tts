import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, Rolldown } from 'tsdown'
import type { TsdownPlugin } from 'tsdown'
import { visualizer } from 'rollup-plugin-visualizer'
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js'

const PACKAGE_ID = 'dsh-xiaomi-tts'
const CLIENT_ENTRY = 'client.js'
const CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/u
const SOURCE_MAP_TRAILER = /\/\/#[ \t]*sourceMappingURL=[^\r\n]*\s*$/u

function bundleVisualizer(target: 'client' | 'host') {
  return visualizer({
    filename: path.resolve('output/bundle-analysis', `${target}.html`),
    title: `${PACKAGE_ID} / ${target}`,
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
    sourcemap: target !== 'host',
    open: target === 'client' && process.env.DSH_BUNDLE_ANALYZE === '1',
  })
}

const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|file-reference|session|llm|tools|brand)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/**
 * Vite-style `?raw` text imports for the client bundle (tsdown/rolldown has
 * no built-in support; see src/client/style/index.ts). `<file>.css?raw` resolves
 * to the real file and imports as its text content as the default export.
 */
function rawTextImports() {
  return {
    name: 'dsh-raw-text-imports',
    resolveId(source, importer) {
      if (!source.endsWith('?raw')) return null
      const target = source.slice(0, -'?raw'.length)
      if (!importer) return null
      const resolved = path.resolve(path.dirname(importer), target)
      return resolved + '?raw'
    },
    load(id) {
      if (!id.endsWith('?raw')) return null
      const target = id.slice(0, -'?raw'.length)
      let content = readFileSync(target, 'utf8')
      if (target.endsWith('.css')) {
        content = content
          .replace(/\/\*[\s\S]*?\*\//gu, '')
          .replace(/[ \t]*\r?\n[ \t]*/gu, ' ')
          .replace(/\s{2,}/gu, ' ')
          .replace(/\s*([{;}])\s*/gu, '$1')
          .trim()
      }
      return `export default ${JSON.stringify(content)};`
    },
  }
}

/** Use DSH's versioned chunk transport for package-local dynamic imports. */
function clientChunkImports(): TsdownPlugin {
  return {
    name: 'dsh-client-chunk-imports',
    renderChunk(code, chunk) {
      const transformed = new Rolldown.RolldownMagicString(code)
      const imports = chunk.dynamicImports.map(file => file.replace(/^\.\//u, '')).filter(file => CLIENT_CHUNK.test(file))
      const asyncImports = new Set(imports)
      const call = /Promise\.resolve\(\)\.then\(\(\)\s*=>\s*require\((['"])\.\/(client\.[\w.-]+\.js)\1\)\)|\brequire\((['"])\.\/(client(?:\.[\w.-]+)?\.js)\3\)/gu
      for (const match of code.matchAll(call)) {
        const [, , asyncFile, , file] = match
        if (asyncFile) {
          if (!imports.includes(asyncFile)) continue
          asyncImports.delete(asyncFile)
          transformed.overwrite(match.index, match.index + match[0].length, `require.async(${JSON.stringify(`./${asyncFile}`)})`)
        } else {
          const id = file === CLIENT_ENTRY ? PACKAGE_ID : `${PACKAGE_ID}/${file}`
          transformed.overwrite(match.index, match.index + match[0].length, `require(${JSON.stringify(id)})`)
        }
      }
      if (asyncImports.size > 0) throw new Error(`Cannot find the generated imports for ${[...asyncImports].join(', ')}`)
      return transformed.hasChanged() ? transformed : null
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle[CLIENT_ENTRY]
        if (entry?.type !== 'chunk') throw new Error(`Missing ${CLIENT_ENTRY}`)
        const chunks = Object.values(bundle).filter(file => file.type === 'chunk')
        const shared = chunks.filter(chunk => !chunk.isEntry && !chunk.isDynamicEntry)
        const deferred = new Set(chunks.filter(chunk => chunk.isDynamicEntry).map(chunk => chunk.fileName))
        for (const chunk of chunks) {
          const callers = chunks.filter(caller => caller.dynamicImports.includes(chunk.fileName))
          for (const dependency of chunk.imports.filter(file => deferred.has(file))) {
            if (!chunk.isDynamicEntry || callers.length === 0 || callers.some(caller => caller.fileName !== dependency)) {
              throw new Error(`${chunk.fileName} requires deferred chunk ${dependency} before it has loaded`)
            }
          }
        }
        if (shared.length === 0) return

        // DSH starts the factory synchronously, so register shared chunks in the
        // entry script. Deferred pages reuse those same module instances.
        const startup: string[] = []
        const combinedMap = new SourceMapGenerator({ file: entry.fileName })
        let lineOffset = 0
        for (const chunk of [...shared, entry]) {
          const code = chunk.code.replace(SOURCE_MAP_TRAILER, '')
          if (chunk.map) {
            const map = new SourceMapConsumer(JSON.parse(chunk.map.toString()))
            map.eachMapping(mapping => {
              const generated = { line: mapping.generatedLine + lineOffset, column: mapping.generatedColumn }
              if (mapping.source === null || mapping.originalLine === null || mapping.originalColumn === null) {
                combinedMap.addMapping({ generated })
              } else {
                combinedMap.addMapping({ generated, source: mapping.source, name: mapping.name,
                  original: { line: mapping.originalLine, column: mapping.originalColumn } })
              }
            })
            for (const source of map.sources) combinedMap.setSourceContent(source, map.sourceContentFor(source, true))
          }
          startup.push(code)
          lineOffset += code.split('\n').length
        }
        const map = bundle[`${entry.fileName}.map`]
        entry.code = startup.join('\n') + '\n'
        if (map?.type === 'asset') {
          map.source = combinedMap.toString()
          entry.code += `//# sourceMappingURL=${map.fileName}\n`
        }
        for (const chunk of shared) {
          delete bundle[chunk.fileName]
          delete bundle[`${chunk.fileName}.map`]
        }
        entry.imports = entry.imports.filter(file => !shared.some(chunk => chunk.fileName === file))
      },
    },
  }
}

export function createClientConfig() {
  return defineConfig({
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    inputOptions: { preserveEntrySignatures: 'allow-extension' },
    sourcemap: true,
    minify: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    plugins: [rawTextImports(), {
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        if (VENDORED_LIBRARY.test(source)) return null
        if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not an allowed DSH client external or inline-safe package`,
        )
      },
    }, clientChunkImports(), ...(process.env.DSH_BUNDLE_ANALYZE === '1' ? [bundleVisualizer('client')] : [])],
    outputOptions: {
      legalComments: 'inline',
      exports: 'named',
      entryFileNames: CLIENT_ENTRY,
      chunkFileNames: 'client.[name].js',
      banner: chunk => `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  })
}

export default defineConfig([{
  name: PACKAGE_ID,
  entry: {
    index: 'src/index.ts',
    'whale-girl': 'src/whale-girl.ts',
    'whale-agent': 'src/whale-agent.ts',
    'client-api': 'src/client-api.ts',
    'host-api': 'src/host-api.ts',
    'speech-host': 'src/speech-host.ts',
    'speech-agent': 'src/speech-agent.ts',
    'studio-agent': 'src/studio-agent.ts',
    qqbot: 'src/qqbot.ts',
    passport: 'src/passport.ts',
    'qqbot-agent': 'src/qqbot-agent.ts',
    'pcm-stream': 'src/pcm-stream.ts',
    shared: 'src/shared.ts',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  external: ['@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-agent-preset', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tools/pipeline', '@deepseek-ai/dsh-llm', 'silk-wasm'],
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  minify: true,
  plugins: process.env.DSH_BUNDLE_ANALYZE === '1' ? [bundleVisualizer('host')] : [],
  outputOptions: { keepNames: true, legalComments: 'inline' },
  clean: true,
}, createClientConfig()])
