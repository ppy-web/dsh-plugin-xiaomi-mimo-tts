import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../tools/start/dsh-profile-cleanup.ps1', import.meta.url))
const windows = { skip: process.platform !== 'win32' }

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cleanup-test-'))
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('dsh-cleanup-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

function cleanup(directory, profile) {
  return exec('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ProfileName', profile], {
    env: { ...process.env, DSH_HOME: directory }, windowsHide: true, timeout: 15000,
  })
}

for (const kind of ['directory', 'junction']) test(`profile cleanup removes only target ${kind} entries and preserves other data`, windows, async t => {
  const directory = await sandbox(t)
  const modules = join(directory, 'profiles', 'desktop', 'node_modules')
  const outside = join(directory, 'linked-source')
  const otherProfile = join(directory, 'profiles', 'other', 'node_modules', 'dsh-xiaomi-tts')
  await Promise.all([mkdir(modules, { recursive: true }), mkdir(outside), mkdir(otherProfile, { recursive: true })])
  await writeFile(join(outside, 'keep.txt'), 'source')
  await writeFile(join(otherProfile, 'keep.txt'), 'other profile')
  await writeFile(join(modules, 'unrelated.txt'), 'unrelated')
  for (const name of ['dsh-xiaomi-tts', 'dsh-plugin-xiaomi-mimo-tts']) {
    const target = join(modules, name)
    if (kind === 'junction') await symlink(outside, target, 'junction')
    else {
      await mkdir(target)
      await writeFile(join(target, 'stale.txt'), 'stale')
    }
  }
  await cleanup(directory, 'desktop')
  for (const name of ['dsh-xiaomi-tts', 'dsh-plugin-xiaomi-mimo-tts']) {
    await assert.rejects(lstat(join(modules, name)), { code: 'ENOENT' })
  }
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'source')
  assert.equal(await readFile(join(otherProfile, 'keep.txt'), 'utf8'), 'other profile')
  assert.equal(await readFile(join(modules, 'unrelated.txt'), 'utf8'), 'unrelated')
})

test('profile cleanup rejects path traversal before touching files', windows, async t => {
  const directory = await sandbox(t)
  const sentinel = join(directory, 'keep.txt')
  await writeFile(sentinel, 'keep')
  for (const profile of ['..', '../other', 'desktop/../../other']) await assert.rejects(cleanup(directory, profile))
  assert.equal(await readFile(sentinel, 'utf8'), 'keep')
})

test('profile cleanup preserves packages still referenced by the manifest', windows, async t => {
  const directory = await sandbox(t)
  const profile = join(directory, 'profiles', 'desktop')
  const target = join(profile, 'node_modules', 'dsh-xiaomi-tts')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'keep.txt'), 'installed')
  for (const manifest of [
    { dependencies: { 'dsh-xiaomi-tts': '*' }, dsh: { profile: { bundles: [] } } },
    { dependencies: {}, dsh: { profile: { bundles: ['dsh-xiaomi-tts'] } } },
  ]) {
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest))
    await assert.rejects(cleanup(directory, 'desktop'))
    assert.equal(await readFile(join(target, 'keep.txt'), 'utf8'), 'installed')
  }
})
