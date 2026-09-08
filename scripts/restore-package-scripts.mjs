import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const backupPath = fileURLToPath(new URL('../.package-scripts-backup.json', import.meta.url))

if (existsSync(backupPath)) {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  packageJson.scripts = JSON.parse(readFileSync(backupPath, 'utf8'))
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  unlinkSync(backupPath)
}
