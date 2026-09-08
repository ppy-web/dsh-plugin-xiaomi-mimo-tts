import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

// Git installs contain source and need a build. Release tarballs already ship
// lib/ and intentionally omit src/ and the build configuration.
if (!existsSync('src') || packageJson.scripts === undefined) process.exit(0)

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(command, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
