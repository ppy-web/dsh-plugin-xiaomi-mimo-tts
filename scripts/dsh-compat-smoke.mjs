import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const DSH_VERSION = process.env.DSH_COMPAT_VERSION ?? '0.1.2-rc.1'
const KEEP_HOME = process.env.DSH_COMPAT_KEEP_HOME === '1'
const READY_TIMEOUT_MS = 180_000
const inputTarball = process.argv[2]

if (inputTarball === undefined) {
  throw new Error('usage: node scripts/dsh-compat-smoke.mjs <plugin.tgz>')
}

const tarball = isAbsolute(inputTarball) ? inputTarball : resolve(inputTarball)
const tarballBytes = await readFile(tarball)
const tarballSha256 = createHash('sha256').update(tarballBytes).digest('hex')

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('failed to allocate a compatibility-test port'))
        return
      }
      server.close((error) => {
        if (error !== undefined) reject(error)
        else resolvePort(address.port)
      })
    })
  })
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true)
  return Promise.race([
    new Promise(resolveExit => child.once('exit', () => resolveExit(true))),
    new Promise(resolveWait => setTimeout(() => resolveWait(false), timeoutMs)),
  ])
}

function spawnPnpm(args, options) {
  if (process.platform !== 'win32') return spawn('pnpm', args, options)
  const env = { ...options.env, DSH_COMPAT_PNPM_ARGS: JSON.stringify(args) }
  return spawn('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    '$pnpmArgs = @(ConvertFrom-Json -InputObject $env:DSH_COMPAT_PNPM_ARGS); & pnpm.cmd @pnpmArgs; exit $LASTEXITCODE',
  ], { ...options, env })
}

function redactSecrets(value) {
  return value.replace(/([?&]token=)[^&\s)]+/gu, '$1<redacted>')
}

function redactedWriter(stream, appendLog) {
  let buffered = ''
  const flushLines = () => {
    const lastBreak = buffered.lastIndexOf('\n')
    if (lastBreak < 0) return
    const ready = redactSecrets(buffered.slice(0, lastBreak + 1))
    buffered = buffered.slice(lastBreak + 1)
    appendLog(ready)
    stream.write(ready)
  }
  return {
    write(chunk) {
      buffered += chunk
      flushLines()
    },
    flush() {
      if (buffered === '') return
      const ready = redactSecrets(buffered)
      buffered = ''
      appendLog(ready)
      stream.write(ready)
    },
  }
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    await waitForExit(killer, 15_000)
    await waitForExit(child, 5_000)
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  if (await waitForExit(child, 5_000)) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await waitForExit(child, 5_000)
}

function run(args, env, appendLog, timeoutMs = 180_000, echoOutput = true) {
  return new Promise((resolveRun, reject) => {
    const child = spawnPnpm(args, {
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    let timedOut = false
    const append = (stream, chunk) => {
      output += chunk
      appendLog(chunk)
      if (echoOutput) stream.write(chunk)
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => append(process.stdout, chunk))
    child.stderr.on('data', chunk => append(process.stderr, chunk))
    child.once('error', reject)
    const timeout = setTimeout(() => {
      timedOut = true
      void stopProcessTree(child)
    }, timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (timedOut) reject(new Error(`pnpm timed out after ${String(timeoutMs)} ms`))
      else if (code === 0) resolveRun(output)
      else reject(new Error(`pnpm exited with status ${String(code)} (${String(signal)})`))
    })
  })
}

function assertCleanLogs(output) {
  const forbidden = [
    /ERR_PNPM_PEER_DEP_ISSUES/iu,
    /Cannot find (?:module|package)[^\n]*@deepseek-ai\/dsh-client-runtime/iu,
    /client-modules:[^\n]*failed to compose/iu,
    /Unsupported DSH settings API/iu,
    /dsh-xiaomi-tts:[^\n]*(?:injection|contribution) disabled/iu,
  ]
  for (const pattern of forbidden) {
    if (pattern.test(output)) throw new Error(`compatibility log matched ${String(pattern)}`)
  }
}

function assertDumpConfig(output) {
  if (!/id:\s*xiaomi-mimo-tts(?:\s|$)/u.test(output) || !/name:\s*dsh-xiaomi-tts(?:\s|$)/u.test(output)) {
    throw new Error('dump-config does not contain the xiaomi-mimo-tts bundle')
  }
}

async function describeSettings(baseURL, cookie) {
  const candidates = [
    { endpoint: 'settings/describe', method: 'settings/describe' },
    { endpoint: 'settings.describe', method: 'settings.describe' },
  ]
  let lastStatus = 404
  for (const candidate of candidates) {
    const response = await fetch(`${baseURL}/api/${candidate.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }) },
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
    if (!Array.isArray(namespaces) || !namespaces.some(entry => entry?.ns === 'xiaomi-mimo-tts')) {
      throw new Error('settings.describe is missing namespace xiaomi-mimo-tts')
    }
    return
  }
  throw new Error(`settings.describe returned ${String(lastStatus)}`)
}

async function exchangeLaunchToken(baseURL, output) {
  const urls = [...output.matchAll(/dsh web:\s+(https?:\/\/[^\s)]+)/gu)].map(match => match[1])
  const authenticatedUrl = urls.find(value => {
    try {
      const url = new URL(value)
      return url.origin === baseURL && url.searchParams.has('token')
    } catch {
      return false
    }
  })
  if (authenticatedUrl === undefined) return undefined
  const response = await fetch(authenticatedUrl, { redirect: 'manual' })
  if (response.status !== 303) throw new Error(`launch-token exchange returned ${String(response.status)}`)
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
  const cookie = setCookie?.split(';', 1)[0]
  if (cookie === undefined || cookie === '') throw new Error('launch-token exchange did not return a session cookie')
  return cookie
}

async function fetchClientBundle(baseURL, cookie) {
  const headers = cookie === undefined ? {} : { cookie }
  const routes = new Set(['/plugins/dsh-xiaomi-tts/client.js', '/plugins/xiaomi-mimo-tts/client.js'])
  const root = await fetch(baseURL, { headers })
  if (root.ok) {
    const html = await root.text()
    for (const match of html.matchAll(/(\/plugins\/[^"'\\s]+\/client\.js(?:\?rev=[^"'\\s]+)?)/gu)) routes.add(match[1])
  }
  let lastStatus = 404
  for (const route of routes) {
    const response = await fetch(`${baseURL}${route}`, {
      headers,
    })
    lastStatus = response.status
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`client bundle returned ${String(response.status)}`)
    return response.text()
  }
  throw new Error(`client bundle returned ${String(lastStatus)} (checked ${[...routes].join(', ')})`)
}

async function waitForCompatibility(baseURL, child, readOutput) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError = new Error('DSH did not become ready')
  let lastReportedError = ''
  let sessionCookie
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`DSH exited before readiness with status ${String(child.exitCode)}`)
    try {
      const status = await fetch(`${baseURL}/plugins/xiaomi-mimo-tts/api-key-status`)
      if (!status.ok) throw new Error(`API key status returned ${String(status.status)}`)
      const statusBody = await status.json()
      if (typeof statusBody.configured !== 'boolean' || typeof statusBody.supported !== 'boolean') {
        throw new Error(`unexpected API key status: ${JSON.stringify(statusBody)}`)
      }
      sessionCookie ??= await exchangeLaunchToken(baseURL, readOutput())
      await describeSettings(baseURL, sessionCookie)
      const clientBody = await fetchClientBundle(baseURL, sessionCookie)
      if (!clientBody.includes('window.__ModuleLoader__.load') || !clientBody.includes('dsh-xiaomi-tts')) {
        throw new Error('client bundle did not register dsh-xiaomi-tts')
      }
      assertCleanLogs(readOutput())
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (lastError.message !== lastReportedError) {
        process.stdout.write(`[WAIT] ${redactSecrets(lastError.message)}\n`)
        lastReportedError = lastError.message
      }
      await new Promise(resolveWait => setTimeout(resolveWait, 500))
    }
  }
  throw new Error(`DSH compatibility smoke timed out: ${lastError.message}`)
}

const dshHome = await mkdtemp(join(tmpdir(), `dsh-compat-${DSH_VERSION}-`))
const env = { ...process.env, DSH_HOME: dshHome, CI: 'true' }
const packageSpec = `@deepseek-ai/dsh@${DSH_VERSION}`
const logPath = join(dshHome, 'compatibility.log')
let child
let output = ''
let log = ''
let succeeded = false
let stdoutWriter
let stderrWriter

const appendLog = (chunk) => { log += chunk }
const info = (message) => {
  const line = `[INFO] ${message}\n`
  appendLog(line)
  process.stdout.write(line)
}

info(`DSH version: ${DSH_VERSION}`)
info(`Tarball: ${tarball}`)
info(`Tarball SHA256: ${tarballSha256}`)
info(`Temporary DSH_HOME: ${dshHome}`)

try {
  const installOutput = await run(['dlx', packageSpec, 'plugin', '--profile', 'web', 'add', tarball], env, appendLog)
  assertCleanLogs(installOutput)
  const installedManifestPath = join(dshHome, 'profiles', 'web', 'node_modules', 'dsh-xiaomi-tts', 'package.json')
  const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
  info(`Plugin version: ${String(installedManifest.version)}`)
  await run(['--dir', join(dshHome, 'profiles', 'web'), 'peers', 'check'], env, appendLog)
  const dumpConfig = await run(['dlx', packageSpec, '--profile', 'web', '--dump-config'], env, appendLog, 180_000, false)
  assertDumpConfig(dumpConfig)

  const port = await availablePort()
  const baseURL = `http://127.0.0.1:${String(port)}`
  child = spawnPnpm(['dlx', packageSpec, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)], {
    detached: process.platform !== 'win32',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  stdoutWriter = redactedWriter(process.stdout, appendLog)
  stderrWriter = redactedWriter(process.stderr, appendLog)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { output += chunk; stdoutWriter.write(chunk) })
  child.stderr.on('data', chunk => { output += chunk; stderrWriter.write(chunk) })

  await waitForCompatibility(baseURL, child, () => output)
  succeeded = true
  process.stdout.write(`DSH ${DSH_VERSION} compatibility smoke passed\n`)
} finally {
  if (child !== undefined) await stopProcessTree(child)
  stdoutWriter?.flush()
  stderrWriter?.flush()
  await writeFile(logPath, log, 'utf8')
  if (succeeded && !KEEP_HOME) await rm(dshHome, { recursive: true, force: true })
  else {
    process.stdout.write(`[INFO] Preserved DSH_HOME: ${dshHome}\n`)
    process.stdout.write(`[INFO] Compatibility log: ${logPath}\n`)
  }
}
