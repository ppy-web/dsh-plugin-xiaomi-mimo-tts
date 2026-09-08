import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const backupPath = fileURLToPath(new URL('../.package-scripts-backup.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

if (packageJson.scripts !== undefined) {
  writeFileSync(backupPath, `${JSON.stringify(packageJson.scripts, null, 2)}\n`)
  delete packageJson.scripts
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}
