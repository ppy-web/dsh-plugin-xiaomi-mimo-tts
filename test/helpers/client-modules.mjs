import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import ts from 'typescript'

const root = new URL('../../', import.meta.url)
const srcRoot = new URL('src/', root).href
const toolsRoot = new URL('tools/', root).href
const sharedLib = new URL('lib/shared.js', root).href
const sharedSrc = new URL('src/shared.js', root).href
const plainText = new URL('../fixtures/plain-text.ts', import.meta.url).href
const compiled = new Map()
const isWindows = process.platform === 'win32'

function sameOriginPrefix(url, prefix) {
  return isWindows ? url.toLowerCase().startsWith(prefix.toLowerCase()) : url.startsWith(prefix)
}

function isHandledModule(url) {
  return sameUrl(url, plainText) || sameOriginPrefix(url, srcRoot) || sameOriginPrefix(url, toolsRoot)
}

function sameUrl(a, b) {
  return isWindows ? a.toLowerCase() === b.toLowerCase() : a === b
}

function transpileFile(fileUrl) {
  const cached = compiled.get(fileUrl)
  if (cached !== undefined) return cached
  const cleanUrl = new URL(fileUrl.split('?')[0])
  const code = `${ts.transpile(readFileSync(cleanUrl, 'utf8'), {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  })}\n//# sourceURL=${cleanUrl.href}\n`
  compiled.set(fileUrl, code)
  return code
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL
    if (!parent || !isHandledModule(parent)) return nextResolve(specifier, context)
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { shortCircuit: true, url: plainText }
    }
    if (!specifier.startsWith('.')) return nextResolve(specifier, context)
    const relative = new URL(specifier, parent)
    if (relative.pathname.endsWith('.json') || relative.pathname.endsWith('.css')) {
      return { shortCircuit: true, url: relative.href }
    }
    if (sameUrl(relative.href, sharedSrc)) {
      return { shortCircuit: true, url: sharedLib }
    }
    const candidates = ['.ts', '.tsx', '.js'].map(extension => new URL(relative.href.replace(/\.js$/, extension)))
    const match = candidates.find(candidate => existsSync(candidate))
    if (match) return { shortCircuit: true, url: match.href }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (!isHandledModule(url)) return nextLoad(url, context)
    const parsed = new URL(url)
    const cleanUrl = new URL(url.split('?')[0])
    if (parsed.pathname.endsWith('.json')) {
      return {
        shortCircuit: true,
        format: 'module',
        source: `export default JSON.parse(${JSON.stringify(readFileSync(cleanUrl, 'utf8'))})\n`,
      }
    }
    if (parsed.pathname.endsWith('.css')) {
      return {
        shortCircuit: true,
        format: 'module',
        source: `export default ${JSON.stringify(readFileSync(cleanUrl, 'utf8'))}\n`,
      }
    }
    if (sameUrl(url, plainText) || parsed.pathname.endsWith('.ts') || parsed.pathname.endsWith('.tsx')) {
      return {
        shortCircuit: true,
        format: 'module',
        source: transpileFile(cleanUrl.href),
      }
    }
    return nextLoad(url, context)
  },
})

/** Load production client code with only the browser UI boundary replaced. */
export async function clientModuleUrl(path) {
  return new URL(path, root).href
}

export async function loadClientModule(path) { return import(await clientModuleUrl(path)) }
export const settle = () => new Promise(resolve => setImmediate(resolve))
