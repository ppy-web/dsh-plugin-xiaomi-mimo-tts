import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dump } from 'js-yaml'
import { collectDependencyReport, renderDependencyReport, syncDependencyIssue, ISSUE_MARKER } from '../tools/scripts/dependency-report.mjs'

const NOW = Date.UTC(2026, 10, 1, 19)
const date = days => new Date(NOW - days * 86400000).toISOString()
const token = 'test-token-must-not-reach-npm'

async function project(manifest, run, workflow = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dependency-report-'))
  const importer = {}
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    importer[group] = Object.fromEntries(Object.entries(manifest[group] ?? {}).map(([name, version]) => [name, { specifier: version, version: `${version}(peer@1.0.0)` }]))
  }
  try {
    await mkdir(join(root, '.github', 'workflows'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(root, 'pnpm-lock.yaml'), dump({ importers: { '.': importer } }))
    await writeFile(join(root, '.github', 'workflows', 'ci.yml'), dump(workflow))
    return await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

function metadata(versions, tags = { latest: Object.keys(versions).at(-1) }) {
  return {
    versions: Object.fromEntries(Object.keys(versions).map(version => [version, {}])),
    time: Object.fromEntries(Object.entries(versions).map(([version, days]) => [version, date(days)])),
    'dist-tags': tags,
  }
}

test('npm reports only installed direct dependencies, honors the 14-day boundary and excludes deprecated versions', async () => {
  const registry = {
    runtime: metadata({ '1.0.0': 100, '1.1.0': 20, '1.2.0': 14, '2.0.0': 2 }),
    development: metadata({ '2.0.0': 100, '3.0.0': 20, '4.0.0': 30 }),
    optional: metadata({ '1.0.0': 100, '1.0.1': 13 }),
  }
  registry.development.versions['4.0.0'].deprecated = 'Use the supported release'
  await project({ dependencies: { runtime: '1.0.0' }, devDependencies: { development: '2.0.0' }, optionalDependencies: { optional: '1.0.0' } }, async root => {
    const report = await collectDependencyReport({ root, now: NOW, token, fetchImpl: async (url, options) => {
      assert.equal(new URL(url).hostname, 'registry.npmjs.org')
      assert.equal(options.headers?.authorization, undefined, 'the GitHub token must never be sent to npm')
      const name = decodeURIComponent(new URL(url).pathname.slice(1))
      assert.ok(registry[name], 'only manifest dependencies may be queried')
      return Response.json(registry[name])
    } })
    assert.deepEqual(report.updates.map(({ name, current, latest, kind }) => ({ name, current, latest, kind })), [
      { name: 'development', current: '2.0.0', latest: '3.0.0', kind: 'major' },
      { name: 'runtime', current: '1.0.0', latest: '1.2.0', kind: 'minor' },
    ])
  })
})

test('stable npm dependencies avoid prereleases and existing prereleases stay on their own channel', async () => {
  await project({ dependencies: { stable: '1.0.0', preview: '1.0.1-alpha.1' } }, async root => {
    const packages = {
      stable: metadata({ '1.0.0': 100, '1.0.1': 20, '2.0.0-alpha.1': 30 }, { latest: '1.0.1', next: '2.0.0-alpha.1' }),
      preview: metadata({ '1.0.0': 100, '1.0.1-alpha.1': 40, '1.0.1-alpha.2': 20, '1.0.1-beta.1': 20 }, { latest: '1.0.0', alpha: '1.0.1-alpha.2', beta: '1.0.1-beta.1' }),
    }
    const report = await collectDependencyReport({ root, now: NOW, fetchImpl: async url => Response.json(packages[new URL(url).pathname.slice(1)]) })
    assert.deepEqual(report.updates.map(({ name, latest }) => ({ name, latest })), [
      { name: 'preview', latest: '1.0.1-alpha.2' }, { name: 'stable', latest: '1.0.1' },
    ])
  })
})

test('action reports respect floating tags and cooldowns and read subsequent release pages', async () => {
  const workflow = { jobs: { test: { steps: [
    { uses: 'example/action@v3' }, { uses: 'example/action@v3.1' }, { uses: 'example/action/subpath@v3.1.2' }, { uses: './local-action' },
  ] } } }
  await project({}, async root => {
    const excluded = Array.from({ length: 100 }, (_, index) => ({ tag_name: `9.0.${index}`, prerelease: true, published_at: date(100) }))
    const report = await collectDependencyReport({ root, now: NOW, token, fetchImpl: async (url, options) => {
      assert.equal(options.headers.authorization, `Bearer ${token}`)
      const address = new URL(url)
      assert.equal(address.pathname, '/repos/example/action/releases')
      return Response.json(address.searchParams.get('page') === '1' ? excluded : [
        { tag_name: 'v4.0.0', published_at: date(2) },
        { tag_name: 'v3.2.0', published_at: date(14) },
        { tag_name: 'v3.1.3', published_at: date(30) },
        { tag_name: 'v5.0.0', published_at: date(30), draft: true },
      ])
    } })
    assert.deepEqual(report.updates.map(({ current, latest }) => ({ current, latest })), [
      { current: 'v3.1', latest: 'v3.2.0' }, { current: 'v3.1.2', latest: 'v3.2.0' },
    ])
    assert.ok(report.updates.every(update => update.locations.includes('.github/workflows/ci.yml')))
  }, workflow)
})

test('failed dependency lookups reject the report instead of claiming that no updates are needed', async () => {
  await project({ dependencies: { runtime: '1.0.0' } }, async root => {
    await assert.rejects(collectDependencyReport({ root, now: NOW, token, fetchImpl: async () => new Response('', { status: 503 }) }), error => {
      assert.ok(!error.message.includes(token))
      return true
    })
    await assert.rejects(collectDependencyReport({ root, now: NOW, fetchImpl: async () => Response.json({}) }))
    await assert.rejects(collectDependencyReport({ root, now: NOW, token, fetchImpl: async () => { throw new Error(token) } }), error => !error.message.includes(token))
    await assert.rejects(collectDependencyReport({ root, now: NOW, fetchImpl: async () => new Response('not JSON') }))
  })
})

const update = version => ({ ecosystem: 'npm', name: 'example', current: '1.0.0', declared: '^1.0.0', group: 'dependencies', latest: version, kind: 'minor', published: '2026-10-01' })

function issueApi(initial = []) {
  const issues = structuredClone(initial), writes = []
  const fetchImpl = async (url, options) => {
    const address = new URL(url), method = options.method
    assert.equal(address.origin, 'https://api.github.com')
    assert.equal(options.headers.authorization, `Bearer ${token}`)
    if (method === 'GET') {
      assert.equal(address.pathname, '/repos/owner/repository/issues')
      assert.equal(address.searchParams.get('state'), 'all')
      const start = (Number(address.searchParams.get('page')) - 1) * 100
      return Response.json(issues.slice(start, start + 100))
    }
    const body = JSON.parse(options.body)
    writes.push({ method, path: address.pathname, body })
    if (method === 'POST') {
      const issue = { ...body, number: 500, state: 'open' }
      issues.push(issue)
      return Response.json(issue, { status: 201 })
    }
    assert.equal(method, 'PATCH')
    const issue = issues.find(item => address.pathname.endsWith(`/${item.number}`))
    assert.ok(issue, 'updates must target the existing managed issue')
    Object.assign(issue, body)
    return Response.json(issue)
  }
  return { issues, writes, options: { repository: 'owner/repository', token, fetchImpl } }
}

test('one issue is created, unchanged runs stay quiet, and changes update and reopen that same issue', async () => {
  const api = issueApi(), report = { updates: [update('1.1.0')] }
  assert.equal(await syncDependencyIssue({ updates: [] }, api.options), 'unchanged')
  assert.equal(api.writes.length, 0)
  assert.equal(await syncDependencyIssue(report, api.options), 'created')
  const created = api.issues[0], number = created.number
  assert.ok(created.body.includes('example') && created.body.includes('1.1.0'), 'the issue must contain the dependency and proposed version')
  assert.equal(await syncDependencyIssue(report, api.options), 'unchanged')
  assert.equal(api.writes.length, 1, 'unchanged reports must not edit or create issues')
  assert.equal(await syncDependencyIssue({ updates: [update('1.2.0')] }, api.options), 'updated')
  assert.equal(api.issues.length, 1)
  assert.equal(await syncDependencyIssue({ updates: [] }, api.options), 'closed')
  assert.equal(created.state, 'closed')
  assert.equal(await syncDependencyIssue({ updates: [update('1.3.0')] }, api.options), 'reopened')
  assert.equal(created.number, number)
  assert.equal(created.state, 'open')
  created.state = 'closed'
  const writes = api.writes.length
  assert.equal(await syncDependencyIssue({ updates: [update('1.3.0')] }, api.options), 'unchanged', 'manual dismissal is respected until dependency data changes')
  assert.equal(api.writes.length, writes)
})

test('issue discovery paginates, ignores PRs and unrelated issues, and never posts comments', async () => {
  const api = issueApi([
    ...Array.from({ length: 100 }, (_, index) => ({ number: index + 1, body: `${ISSUE_MARKER}\nPR`, pull_request: {} })),
    { number: 101, state: 'open', body: 'Unrelated issue' },
    { number: 102, state: 'open', body: `${ISSUE_MARKER}\nOlder report` },
  ])
  assert.equal(await syncDependencyIssue({ updates: [update('1.2.0')] }, api.options), 'updated')
  assert.deepEqual(api.writes.map(({ method, path }) => ({ method, path })), [{ method: 'PATCH', path: '/repos/owner/repository/issues/102' }])
  assert.equal(api.issues[100].body, 'Unrelated issue')
  const failed = issueApi()
  await assert.rejects(syncDependencyIssue({ updates: [update('1.1.0')] }, {
    ...failed.options, fetchImpl: async () => new Response('', { status: 403 }),
  }))
  assert.equal(failed.writes.length, 0, 'a failed issue lookup must not create duplicates')
})

test('rendering preserves all actionable versions and escapes manifest table values', () => {
  const body = renderDependencyReport({ updates: [{ ...update('1.1.0'), declared: '^1.0.0 | custom\nvalue' }] })
  assert.ok(body.includes('1.0.0') && body.includes('1.1.0'))
  assert.ok(!body.includes('custom\nvalue'), 'manifest values must not break table rows')
})
