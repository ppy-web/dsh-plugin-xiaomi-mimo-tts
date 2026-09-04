import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

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

async function describeSettings() {
  const candidates = [
    { endpoint: 'settings/describe', method: 'settings/describe' },
    { endpoint: 'settings.describe', method: 'settings.describe' },
  ]
  let lastStatus = 404
  for (const candidate of candidates) {
    const response = await fetch(`${baseURL}/api/${candidate.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: candidate.method,
        payload: candidate.endpoint.includes('/') ? { args: {} } : {},
      }),
    })
    lastStatus = response.status
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`settings.describe returned ${String(response.status)}`)
    const body = await response.json()
    if (body?.result?.ok !== true) throw new Error(`settings.describe failed: ${JSON.stringify(body)}`)
    const namespaces = body.result.value?.namespaces
    if (!Array.isArray(namespaces) || !namespaces.some(entry => entry?.ns === NAMESPACE)) {
      throw new Error(`settings.describe is missing namespace ${NAMESPACE}`)
    }
    return
  }
  throw new Error(`settings.describe returned ${String(lastStatus)}`)
}

async function fetchClientBundle() {
  const individualRoutes = new Set([`/plugins/${PACKAGE_NAME}/client.js`, `/plugins/${NAMESPACE}/client.js`])
  const comboRoutes = new Set()
  const root = await fetch(baseURL)
  if (root.ok) {
    const html = await root.text()
    for (const match of html.matchAll(/(\/plugins\/[^"'\s]+\/client\.js(?:\?rev=[^"'\s]+)?)/gu)) individualRoutes.add(match[1])
    for (const match of html.matchAll(/(\/plugins\/\?\?[^"'\s]+\/client\.js[^"'\s]*)/gu)) comboRoutes.add(match[1])
  }
  const routes = [...individualRoutes, ...comboRoutes]
  let lastStatus = 404
  let successfulRoutes = []
  for (const route of routes) {
    const response = await fetch(`${baseURL}${route}`)
    lastStatus = response.status
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`client bundle returned ${String(response.status)}`)
    const body = Buffer.from(await response.arrayBuffer())
    const isComboRoute = route.startsWith('/plugins/??')
    if ((isComboRoute && route.includes(`${PACKAGE_NAME}/client.js`)) || body.toString('utf8').includes(PACKAGE_NAME)) {
      return { response, body, route }
    }
    successfulRoutes.push(route)
  }
  if (successfulRoutes.length > 0) {
    throw new Error(`client bundle did not register ${PACKAGE_NAME} (checked ${successfulRoutes.join(', ')})`)
  }
  throw new Error(`client bundle returned ${String(lastStatus)} (checked ${[...routes].join(', ')})`)
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

await describeSettings()
const client = await fetchClientBundle()
const servedClientBytes = client.body
const servedClientText = servedClientBytes.toString('utf8')
if (!client.route.startsWith('/plugins/??') && (!servedClientText.includes('window.__ModuleLoader__.load') || !servedClientText.includes(PACKAGE_NAME))) {
  throw new Error(`client bundle did not register ${PACKAGE_NAME}`)
}

const expectedCheckout = process.env.DSH_PROFILE_EXPECT_CHECKOUT?.trim()
const expectedRealPath = expectedCheckout === undefined || expectedCheckout === ''
  ? undefined
  : await realpath(resolve(expectedCheckout))
if (expectedRealPath !== undefined && resolve(installedRealPath) !== resolve(expectedRealPath)) {
  throw new Error(`installed link target mismatch: expected ${expectedRealPath}, received ${installedRealPath}`)
}
const localBundleRoot = expectedRealPath ?? (localLinkMode ? installedRealPath : undefined)
if (localBundleRoot !== undefined) {
  const diskClientSha256 = sha256(await readFile(join(localBundleRoot, 'lib', 'client.js')))
  const servedClientSha256 = sha256(servedClientBytes)
  if (diskClientSha256 !== servedClientSha256) {
    throw new Error(`mixed profile state: disk client SHA256 ${diskClientSha256} != served bundle SHA256 ${servedClientSha256}`)
  }
  process.stdout.write(`[OK] Local bundle SHA256: ${diskClientSha256}\n`)
}

process.stdout.write(`[OK] DSH_HOME: ${dshHome}\n`)
process.stdout.write(`[OK] Profile: ${profileName}\n`)
process.stdout.write(`[OK] Plugin: ${PACKAGE_NAME}@${String(installedManifest.version)}\n`)
process.stdout.write(`[OK] Installed path: ${installedRoot}\n`)
process.stdout.write(`[OK] Local link mode: ${String(localLinkMode)}\n`)
process.stdout.write(`[OK] Resolved target: ${installedRealPath}\n`)
process.stdout.write(`[OK] Host status, settings namespace and client bundle verified at ${baseURL}\n`)
