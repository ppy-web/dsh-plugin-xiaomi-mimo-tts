import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'
const args = isWindows ? ['/d', '/s', '/c', 'pnpm.cmd run build'] : ['run', 'build']
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, DSH_BUNDLE_ANALYZE: '1' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
