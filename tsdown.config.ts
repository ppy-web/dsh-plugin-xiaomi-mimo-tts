import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-xiaomi-tts'

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

export function createClientConfig(debugLogs = false) {
  return defineConfig({
    name: debugLogs ? `${PACKAGE_ID}/client-debug` : `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.MIMO_TTS_DEBUG': JSON.stringify(String(debugLogs)),
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
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  })
}

export const clientConfig = createClientConfig()

export default clientConfig
