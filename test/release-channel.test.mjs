import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { releaseMetadata } from '../tools/scripts/release-metadata.mjs'

const name = 'dsh-xiaomi-tts'

test('release channels support an explicit next channel for a version without a prerelease suffix', () => {
  assert.equal(releaseMetadata({ name, version: '4.0.0', publishConfig: { tag: 'next' } }, 'v4.0.0').npmTag, 'next')
  assert.equal(releaseMetadata({ name, version: '4.0.0' }, 'v4.0.0').npmTag, 'latest')
  assert.equal(releaseMetadata({ name, version: '4.0.0-next.1' }, 'v4.0.0-next.1').npmTag, 'next')
  assert.equal(releaseMetadata({ name, version: '4.0.0+build.1' }, 'v4.0.0+build.1').npmTag, 'latest')
})

test('release validation rejects mismatched tags, unsupported channels and prereleases on latest', () => {
  assert.throws(() => releaseMetadata({ name, version: '4.0.0' }, 'v3.0.9'), Error)
  assert.throws(() => releaseMetadata({ name, version: '4.0.0', publishConfig: { tag: 'invalid' } }, 'v4.0.0'), Error)
  assert.throws(() => releaseMetadata({ name, version: '4.0.0-next.1', publishConfig: { tag: 'latest' } }, 'v4.0.0-next.1'), Error)
})

test('release metadata command exposes the selected channel to GitHub Actions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-release-metadata-'))
  try {
    const manifest = { name, version: '4.0.0', publishConfig: { tag: 'next' } }
    const output = path.join(directory, 'output')
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
    execFileSync(process.execPath, [fileURLToPath(new URL('../tools/scripts/release-metadata.mjs', import.meta.url))], {
      cwd: directory,
      env: { ...process.env, RELEASE_TAG: 'v4.0.0', GITHUB_OUTPUT: output },
    })
    const metadata = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map(line => line.split('=')))
    assert.deepEqual(metadata, { package_name: name, version: '4.0.0', npm_tag: 'next' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
