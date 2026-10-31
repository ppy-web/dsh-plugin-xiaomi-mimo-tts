import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { visualizer } from 'rollup-plugin-visualizer'

const PACKAGE_ID = 'dsh-xiaomi-tts'

function bundleVisualizer(target: 'client' | 'host') {
  return visualizer({
    filename: path.resolve('output/bundle-analysis', `${target}.html`),
    title: `${PACKAGE_ID} / ${target}`,
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
    sourcemap: target === 'client',
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
      return `export default ${JSON.stringify(readFileSync(target, 'utf8'))};`
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
    }, bundleVisualizer('client')],
    outputOptions: {
      keepNames: true,
      legalComments: 'inline',
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
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
    qqbot: 'src/qqbot.ts',
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
  plugins: [bundleVisualizer('host')],
  outputOptions: { keepNames: true, legalComments: 'inline' },
  clean: true,
}, createClientConfig()])
