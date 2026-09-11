import { readFile, lstat, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

const PACKAGE_NAME = 'dsh-xiaomi-tts'
const NAMESPACE = 'xiaomi-mimo-tts'
const dshHome = resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'))
const profileName = process.env.DSH_PROFILE?.trim() || 'web'
const host = process.env.DSH_WEB_HOST?.trim() || '127.0.0.1'
const portText = process.env.DSH_WEB_PORT?.trim() || '3080'
const port = Number(portText)

if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`invalid DSH_WEB_PORT: ${portText}`)

const profileRoot = join(dshHome, 'profiles', profileName)
const profileManifestPath = join(profileRoot, 'package.json')
const installedRoot = join(profileRoot, 'node_modules', PACKAGE_NAME)
const installedManifestPath = join(installedRoot, 'package.json')
const connectHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
const baseURL = `http://${connectHost}:${String(port)}`

function spawnDsh(args, options) {
  if (process.platform !== 'win32') return spawn('dsh', args, options)
  const env = { ...options.env, DSH_PROFILE_DSH_ARGS: JSON.stringify(args) }
  return spawn('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    '$dshArgs = @(ConvertFrom-Json -InputObject $env:DSH_PROFILE_DSH_ARGS); & dsh.cmd @dshArgs; exit $LASTEXITCODE',
  ], { ...options, env })
}

function run(args, timeoutMs = 30_000) {
  return new Promise((resolveRun, reject) => {
    const child = spawnDsh(args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.once('error', (error) => { settled = true; reject(error) })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`dsh timed out after ${String(timeoutMs)} ms`))
    }, timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (settled) return
      settled = true
      if (code === 0) resolveRun(output)
      else reject(new Error(`dsh exited with status ${String(code)} (${String(signal)}):\n${output}`))
    })
  })
}

function assertDumpConfig(output) {
  if (!/id:\s*xiaomi-mimo-tts(?:\s|$)/u.test(output) || !/name:\s*dsh-xiaomi-tts(?:\s|$)/u.test(output)) {
    throw new Error('dump-config does not contain the xiaomi-mimo-tts bundle')
  }
}

const profileManifest = JSON.parse(await readFile(profileManifestPath, 'utf8'))
if (profileManifest.dependencies?.[PACKAGE_NAME] === undefined) {
  throw new Error(`${profileManifestPath} is missing dependency ${PACKAGE_NAME}`)
}
const profileBundles = profileManifest.dsh?.profile?.bundles
if (!Array.isArray(profileBundles) || !profileBundles.includes(PACKAGE_NAME)) {
  throw new Error(`${profileManifestPath} is missing bundle ${PACKAGE_NAME}`)
}

const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
if (installedManifest.version !== '3.0.3') {
  throw new Error(`installed plugin version is ${String(installedManifest.version)}, expected 3.0.3`)
}
const installedStat = await lstat(installedRoot)
const installedRealPath = await realpath(installedRoot)
const linkMode = installedStat.isSymbolicLink() || resolve(installedRealPath) !== resolve(installedRoot)
const relativeTarget = relative(profileRoot, installedRealPath)
const localLinkMode = linkMode && (relativeTarget.startsWith('..') || isAbsolute(relativeTarget))
const dumpConfig = await run(['--profile', profileName, '--dump-config'])
assertDumpConfig(dumpConfig)

const status = await fetch(`${baseURL}/plugins/${NAMESPACE}/api-key-status`)
if (!status.ok) throw new Error(`API key status returned ${String(status.status)}`)
const statusBody = await status.json()
if (typeof statusBody.configured !== 'boolean' || typeof statusBody.supported !== 'boolean') {
  throw new Error(`unexpected API key status: ${JSON.stringify(statusBody)}`)
}

const expectedCheckout = process.env.DSH_PROFILE_EXPECT_CHECKOUT?.trim()
const expectedRealPath = expectedCheckout === undefined || expectedCheckout === ''
  ? undefined
  : await realpath(resolve(expectedCheckout))
if (expectedRealPath !== undefined && resolve(installedRealPath) !== resolve(expectedRealPath)) {
  throw new Error(`installed link target mismatch: expected ${expectedRealPath}, received ${installedRealPath}`)
}
process.stdout.write(`[OK] DSH_HOME: ${dshHome}\n`)
process.stdout.write(`[OK] Profile: ${profileName}\n`)
process.stdout.write(`[OK] Plugin: ${PACKAGE_NAME}@${String(installedManifest.version)}\n`)
process.stdout.write(`[OK] Installed path: ${installedRoot}\n`)
process.stdout.write(`[OK] Local link mode: ${String(localLinkMode)}\n`)
process.stdout.write(`[OK] Resolved target: ${installedRealPath}\n`)
process.stdout.write(`[OK] Host status and installed plugin verified at ${baseURL}\n`)
