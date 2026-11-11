import ts from 'typescript'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Check the published API shape without adding machine-local paths to the lockfile.
const root = fileURLToPath(new URL('../../', import.meta.url))
const hostRoot = resolve(process.argv[2] ?? process.env.DSH_SOURCE ?? resolve(root, '../deepseek-harness'))
const hostPackage = JSON.parse(readFileSync(resolve(hostRoot, 'package.json'), 'utf8'))
const hostConfig = ts.readConfigFile(resolve(hostRoot, 'tsconfig.base.json'), ts.sys.readFile)
if (hostConfig.error) throw new Error(ts.flattenDiagnosticMessageText(hostConfig.error.messageText, '\n'))

const paths = {}
for (const [name, targets] of Object.entries(hostConfig.config.compilerOptions.paths)) {
  paths[name] = targets.map(target => {
    const path = resolve(hostRoot, target.replace(/\/src(?=\/|$)/, '/lib/types').replace(/\.tsx?$/, '.d.ts'))
    if (path.includes('*') || path.endsWith('.d.ts')) return path
    return existsSync(`${path}.d.ts`) ? `${path}.d.ts` : resolve(path, 'index.d.ts')
  })
}
for (const name of Object.keys(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).devDependencies)) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  const candidates = paths[name] ?? []
  if (!candidates.some(path => existsSync(path) || existsSync(resolve(path, 'index.d.ts')))) {
    throw new Error(`Missing built host API for ${name}. Run pnpm build:artifacts in ${hostRoot} first.`)
  }
}
paths.react = [resolve(root, 'node_modules/@types/react/index.d.ts')]
paths['react/jsx-runtime'] = [resolve(root, 'node_modules/@types/react/jsx-runtime.d.ts')]
paths['react-dom'] = [resolve(root, 'node_modules/@types/react-dom/index.d.ts')]

const output = resolve(root, 'output/host-baseline')
mkdirSync(output, { recursive: true })
const configPath = resolve(output, 'tsconfig.json')
writeFileSync(configPath, JSON.stringify({
  extends: resolve(root, 'tsconfig.json'),
  compilerOptions: { paths, noEmit: true },
  include: [resolve(root, 'src/**/*.ts'), resolve(root, 'src/**/*.tsx')],
}, null, 2))
const formatHost = { getCanonicalFileName: path => path, getCurrentDirectory: () => root, getNewLine: () => '\n' }
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic(diagnostic) {
    throw new Error(ts.formatDiagnostics([diagnostic], formatHost))
  },
})
const program = ts.createProgram(config.fileNames, config.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
console.log(`DSH source baseline: ${hostPackage.version} (${hostRoot})`)
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
else console.log('Plugin types match the built host API.')
process.exitCode = diagnostics.length ? 1 : 0
