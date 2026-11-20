import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'
const args = isWindows
  ? ['/d', '/s', '/c', 'pnpm.cmd pack --dry-run']
  : ['pack', '--dry-run']

const result = spawnSync(command, args, { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
