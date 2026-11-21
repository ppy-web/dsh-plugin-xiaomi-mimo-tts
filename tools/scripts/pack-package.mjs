import { copyFileSync, globSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const { files, scripts: _scripts, publishConfig, ...manifest } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { directory, linkDirectory: _linkDirectory, ...publishedConfig } = publishConfig
const output = resolve(root, 'output')
const destination = resolve(root, directory)
const subdirectory = relative(output, destination)
if (!subdirectory || isAbsolute(subdirectory) || subdirectory === '..' || subdirectory.startsWith(`..${sep}`)) {
  throw new Error('Package staging directory must be inside output')
}
for (let path = destination; relative(root, path); path = dirname(path)) {
  if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('Package staging directory cannot traverse a symbolic link')
  }
}
rmSync(destination, { recursive: true, force: true })

const include = files.filter(pattern => !pattern.startsWith('!')).flatMap(pattern => [pattern, `${pattern}/**`])
const exclude = files.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
const includedFiles = globSync(include, { cwd: root, exclude })
  .filter(path => lstatSync(join(root, path)).isFile())
  .map(path => path.split(sep).join('/'))
  .sort()

// Explicit paths keep stale build output from a previous pack out of the next one.
for (const path of includedFiles) {
  const dest = join(destination, path)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(root, path === 'README.md' ? 'intro.md' : path), dest)
}

const published = { ...manifest, files: includedFiles, publishConfig: publishedConfig }
writeFileSync(join(destination, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)
