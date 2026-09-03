import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const DSH_VERSION = process.env.DSH_COMPAT_VERSION ?? '0.1.1-rc.2'
const TIMEOUT_MS = 90_000
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const inputTarball = process.argv[2]

if (inputTarball === undefined) {
  throw new Error('usage: node scripts/dsh-compat-smoke.mjs <plugin.tgz>')
}

const tarball = isAbsolute(inputTarball) ? inputTarball : resolve(inputTarball)
await readFile(tarball)

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

function run(command, args, env, timeoutMs = 180_000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const append = (stream, chunk) => {
      output += chunk
      stream.write(chunk)
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => append(process.stdout, chunk))
    child.stderr.on('data', chunk => append(process.stderr, chunk))
    child.once('error', reject)
    const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolveRun(output)
      else reject(new Error(`${command} exited with status ${String(code)} (${String(signal)})`))
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

async function waitForCompatibility(baseURL, child, readOutput) {
  const deadline = Date.now() + TIMEOUT_MS
  let lastError = new Error('DSH did not become ready')
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`DSH exited before readiness with status ${String(child.exitCode)}`)
    try {
      const root = await fetch(baseURL)
      if (!root.ok) throw new Error(`root returned ${String(root.status)}`)

      const status = await fetch(`${baseURL}/plugins/xiaomi-mimo-tts/api-key-status`)
      if (!status.ok) throw new Error(`API key status returned ${String(status.status)}`)
      const statusBody = await status.json()
      if (statusBody.configured !== false || statusBody.supported !== false) {
        throw new Error(`unexpected API key status: ${JSON.stringify(statusBody)}`)
      }

      const client = await fetch(`${baseURL}/plugins/dsh-xiaomi-tts/client.js`)
      if (!client.ok) throw new Error(`client bundle returned ${String(client.status)}`)
      const clientBody = await client.text()
      if (!clientBody.includes('window.__ModuleLoader__.load') || !clientBody.includes('dsh-xiaomi-tts')) {
        throw new Error('client bundle did not register dsh-xiaomi-tts')
      }

      assertCleanLogs(readOutput())
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await new Promise(resolveWait => setTimeout(resolveWait, 500))
    }
  }
  throw new Error(`DSH compatibility smoke timed out: ${lastError.message}`)
}

async function stopProcess(child) {
  if (child.exitCode !== null) return
  const signal = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name)
      else process.kill(-child.pid, name)
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }
  signal('SIGTERM')
  await Promise.race([
    new Promise(resolveExit => child.once('exit', resolveExit)),
    new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
  ])
  if (child.exitCode === null) signal('SIGKILL')
}

const dshHome = await mkdtemp(join(tmpdir(), `dsh-compat-${DSH_VERSION}-`))
const env = { ...process.env, DSH_HOME: dshHome, CI: 'true' }
const packageSpec = `@deepseek-ai/dsh@${DSH_VERSION}`
let child
let output = ''

try {
  const installOutput = await run(pnpm, ['dlx', packageSpec, 'plugin', '--profile', 'web', 'add', tarball], env)
  assertCleanLogs(installOutput)
  await run(pnpm, ['--dir', join(dshHome, 'profiles', 'web'), 'peers', 'check'], env)

  const port = await availablePort()
  const baseURL = `http://127.0.0.1:${String(port)}`
  child = spawn(pnpm, ['dlx', packageSpec, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)], {
    detached: process.platform !== 'win32',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
  child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk) })

  await waitForCompatibility(baseURL, child, () => output)
  process.stdout.write(`DSH ${DSH_VERSION} compatibility smoke passed\n`)
} finally {
  if (child !== undefined) await stopProcess(child)
  await rm(dshHome, { recursive: true, force: true })
}
