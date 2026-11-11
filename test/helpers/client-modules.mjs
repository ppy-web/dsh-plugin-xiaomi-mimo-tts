import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const root = new URL('../../', import.meta.url)
const modules = new Map()
const plainText = new URL('../fixtures/plain-text.ts', import.meta.url).href

/** Load production client code with only the browser UI boundary replaced. */
export async function clientModuleUrl(path) {
  const source = new URL(path, root)
  if (modules.has(source.href)) return modules.get(source.href)
  const pending = compile(source)
  modules.set(source.href, pending)
  return pending
}

async function compile(source) {
  let code = ts.transpile(await readFile(source, 'utf8'), {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  })
  const imports = [...code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]
  for (const [, specifier] of imports) {
    let target
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') target = plainText
    else if (specifier.startsWith('.')) {
      const relative = new URL(specifier, source)
      if (relative.pathname.endsWith('.json')) target = relative.href
      else if (relative.href === new URL('src/shared.js', root).href) target = new URL('lib/shared.js', root).href
      else {
        const candidates = ['.ts', '.tsx', '.js'].map(extension => new URL(relative.href.replace(/\.js$/, extension)))
        target = await clientModuleUrl(candidates.find(candidate => existsSync(candidate)).href)
      }
    } else target = import.meta.resolve(specifier)
    code = code.replaceAll(`'${specifier}'`, `'${target}'`).replaceAll(`"${specifier}"`, `"${target}"`)
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

export async function loadClientModule(path) { return import(await clientModuleUrl(path)) }
export const settle = () => new Promise(resolve => setImmediate(resolve))
