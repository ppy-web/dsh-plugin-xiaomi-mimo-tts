import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const backupPath = fileURLToPath(new URL('../.package-scripts-backup.json', import.meta.url))
const originalPackage = readFileSync(packagePath)
const hadBackup = existsSync(backupPath)
const originalBackup = hadBackup ? readFileSync(backupPath) : undefined
const isWindows = process.platform === 'win32'
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'
const args = isWindows
  ? ['/d', '/s', '/c', 'pnpm.cmd pack --dry-run']
  : ['pack', '--dry-run']

let status = 1
try {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  status = result.status ?? 1
} finally {
  // pnpm may run prepack without postpack for --dry-run. Restore the exact
  // source files regardless of whether the child pack command succeeds.
  writeFileSync(packagePath, originalPackage)
  if (hadBackup) writeFileSync(backupPath, originalBackup)
  else if (existsSync(backupPath)) unlinkSync(backupPath)
}

process.exitCode = status
