import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
import semver from 'semver'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DAY_MS = 24 * 60 * 60 * 1000
export const COOLDOWN_DAYS = 14
export const ISSUE_MARKER = '<!-- dsh-dependency-report:v1 -->'
const ISSUE_TITLE = '依赖更新汇总'

function apiClient(fetchImpl, token) {
  const json = async (url, options = {}) => {
    const resource = `${new URL(url).hostname}${new URL(url).pathname}`
    let response
    try { response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000), ...options }) }
    catch { throw new Error(`Dependency lookup failed: ${resource} (network error)`) }
    if (!response.ok) throw new Error(`Dependency lookup failed: ${resource} (HTTP ${response.status})`)
    if (response.status === 204) return undefined
    try { return await response.json() }
    catch { throw new Error(`Dependency lookup failed: ${resource} (invalid JSON)`) }
  }
  const github = (path, method = 'GET', body) => json(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const pages = async path => {
    const rows = []
    for (let page = 1; ; page++) {
      const batch = await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      if (!Array.isArray(batch)) throw new Error(`Invalid GitHub response: ${path}`)
      rows.push(...batch)
      if (batch.length < 100) return rows
    }
  }
  return { json, github, pages }
}

function mature(date, now) {
  const published = Date.parse(date)
  return Number.isFinite(published) && published <= now - COOLDOWN_DAYS * DAY_MS
}

function updateType(current, latest) {
  for (const field of ['major', 'minor', 'patch']) {
    if (semver[field](current) !== semver[field](latest)) return field
  }
  return 'prerelease'
}

function npmTarget(metadata, current, now) {
  if (!metadata.versions || !metadata.time || !metadata['dist-tags']) throw new Error('Incomplete npm package metadata')
  const channel = semver.prerelease(current)?.[0]
  const sameChannel = version => channel !== undefined && semver.prerelease(version)?.[0] === channel
  const ceilings = Object.entries(metadata['dist-tags'])
    .filter(([, version]) => semver.valid(version))
    .filter(([tag, version]) => tag === 'latest' || sameChannel(version))
    .map(([, version]) => version)
  const ceiling = semver.rsort(ceilings)[0]
  if (!ceiling) return undefined
  return semver.rsort(Object.keys(metadata.versions).filter(version => semver.valid(version)
    && semver.gt(version, current) && semver.lte(version, ceiling)
    && (!semver.prerelease(version) || sameChannel(version))
    && !metadata.versions[version].deprecated && mature(metadata.time[version], now)))[0]
}

function actionReferences(document, location, references) {
  if (!document || typeof document !== 'object') return
  for (const [key, value] of Object.entries(document)) {
    if (key !== 'uses' || typeof value !== 'string') {
      if (value && typeof value === 'object') actionReferences(value, location, references)
      continue
    }
    if (value.startsWith('./') || value.startsWith('docker://')) continue
    const match = /^([\w.-]+\/[\w.-]+)(?:\/[^@]+)?@([^\s]+)$/u.exec(value)
    if (!match) throw new Error(`Unsupported action reference in ${location}: ${value}`)
    const [, name, ref] = match
    const version = semver.valid(ref) ?? (/^v?\d+(?:\.\d+)?$/u.test(ref) ? semver.coerce(ref)?.version : undefined)
    if (!version) throw new Error(`Action requires a version tag for dependency reporting: ${value}`)
    const id = `${name}@${ref}`
    if (!references.has(id)) references.set(id, { name, current: ref, version, locations: new Set() })
    references.get(id).locations.add(location)
  }
}

function newerAction(reference, version) {
  if (!semver.gt(version, reference.version)) return false
  if (/^v?\d+$/u.test(reference.current)) return semver.major(version) > semver.major(reference.version)
  if (/^v?\d+\.\d+$/u.test(reference.current)) {
    return semver.major(version) > semver.major(reference.version) || semver.minor(version) > semver.minor(reference.version)
  }
  return true
}

export async function collectDependencyReport({ root = ROOT, now = Date.now(), fetchImpl = fetch, token = '' } = {}) {
  const api = apiClient(fetchImpl, token)
  const [manifestText, lockText, workflowFiles] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'pnpm-lock.yaml'), 'utf8'),
    readdir(join(root, '.github', 'workflows')),
  ])
  const manifest = JSON.parse(manifestText), importer = load(lockText)?.importers?.['.']
  if (!importer) throw new Error('The root pnpm lockfile importer is missing')
  const dependencies = new Map(), references = new Map()
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, declared] of Object.entries(manifest[group] ?? {})) {
      const current = importer[group]?.[name]?.version?.split('(')[0]
      if (!semver.valid(current)) throw new Error(`Missing or unsupported locked version for ${name}`)
      dependencies.set(name, { name, declared, current, group })
    }
  }
  await Promise.all(workflowFiles.filter(file => /\.ya?ml$/u.test(file)).map(async file => {
    const location = `.github/workflows/${file}`
    actionReferences(load(await readFile(join(root, location), 'utf8')), location, references)
  }))
  const jobs = [...dependencies.values()].map(dependency => async () => {
    const metadata = await api.json(`https://registry.npmjs.org/${encodeURIComponent(dependency.name)}`)
    const latest = npmTarget(metadata, dependency.current, now)
    return latest ? {
      ecosystem: 'npm', ...dependency, latest, kind: updateType(dependency.current, latest),
      published: new Date(metadata.time[latest]).toISOString().slice(0, 10),
    } : undefined
  })
  const releases = new Map()
  for (const reference of references.values()) jobs.push(async () => {
    if (!releases.has(reference.name)) releases.set(reference.name, api.pages(`/repos/${reference.name}/releases`))
    const candidates = (await releases.get(reference.name)).filter(release => !release.draft && !release.prerelease
      && semver.valid(release.tag_name) && !semver.prerelease(release.tag_name)
      && newerAction(reference, release.tag_name) && mature(release.published_at, now))
    candidates.sort((a, b) => semver.rcompare(a.tag_name, b.tag_name))
    const release = candidates[0]
    return release ? {
      ecosystem: 'github-actions', name: reference.name, current: reference.current, latest: release.tag_name,
      kind: updateType(reference.version, release.tag_name), published: new Date(release.published_at).toISOString().slice(0, 10),
      locations: [...reference.locations].sort(),
    } : undefined
  })
  const updates = []
  // Bound registry traffic while retaining deterministic report ordering.
  for (let index = 0; index < jobs.length; index += 6) updates.push(...await Promise.all(jobs.slice(index, index + 6).map(job => job())))
  return { updates: updates.filter(Boolean).sort((a, b) => `${a.ecosystem}/${a.name}/${a.current}`.localeCompare(`${b.ecosystem}/${b.name}/${b.current}`, 'en')) }
}

const cell = value => String(value).replaceAll('|', '\\|').replaceAll('`', '').replace(/[\r\n]/gu, ' ')

export function renderDependencyReport({ updates }) {
  const lines = [ISSUE_MARKER, '', `每月检查 npm 直接依赖和 GitHub Actions，仅列出已发布满 ${COOLDOWN_DAYS} 天的候选版本。此 issue 持续更新，升级由维护者决定。`, '']
  for (const [ecosystem, title] of [['npm', 'npm 依赖'], ['github-actions', 'GitHub Actions']]) {
    const rows = updates.filter(update => update.ecosystem === ecosystem)
    if (!rows.length) continue
    lines.push(`## ${title}`, '', '| 依赖 | 当前版本 | 候选版本 | 类型 | 发布日期 | 位置 |', '| --- | --- | --- | --- | --- | --- |')
    for (const update of rows) {
      const url = ecosystem === 'npm'
        ? `https://www.npmjs.com/package/${update.name}/v/${update.latest}`
        : `https://github.com/${update.name}/releases/tag/${encodeURIComponent(update.latest)}`
      const location = ecosystem === 'npm' ? `package.json (${update.group}: ${update.declared})` : update.locations.join(', ')
      lines.push(`| ${cell(update.name)} | ${cell(update.current)} | [${cell(update.latest)}](${url}) | ${update.kind} | ${update.published} | ${cell(location)} |`)
    }
    lines.push('')
  }
  if (!updates.length) lines.push('当前没有已过冷却期的待更新依赖。', '')
  lines.push('GitHub Actions 的浮动主版本或次版本标签仅报告超出其范围的更新；固定版本标签报告后续版本。npm 稳定版不切换到预发布版，已有预发布依赖仅跟踪同名预发布渠道及稳定版。', '', '漏洞告警继续由 GitHub Dependabot Alerts 管理。')
  return lines.join('\n')
}

export async function syncDependencyIssue(report, { repository, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? '') || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required to update the dependency issue')
  const api = apiClient(fetchImpl, token)
  const issues = await api.pages(`/repos/${repository}/issues?state=all&sort=created&direction=desc`)
  const issue = issues.find(item => !item.pull_request && item.body?.startsWith(ISSUE_MARKER))
  const body = renderDependencyReport(report)
  if (!report.updates.length) {
    if (!issue || issue.state === 'closed') return 'unchanged'
    await api.github(`/repos/${repository}/issues/${issue.number}`, 'PATCH', { body, state: 'closed', state_reason: 'completed' })
    return 'closed'
  }
  // Honor a manually closed report until its dependency list changes.
  if (issue?.body === body) return 'unchanged'
  if (issue) {
    await api.github(`/repos/${repository}/issues/${issue.number}`, 'PATCH', { body, state: 'open' })
    return issue.state === 'closed' ? 'reopened' : 'updated'
  }
  await api.github(`/repos/${repository}/issues`, 'POST', { title: ISSUE_TITLE, body })
  return 'created'
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--write')) throw new Error('Usage: node tools/scripts/dependency-report.mjs [--write]')
  const token = process.env.GH_TOKEN ?? ''
  const report = await collectDependencyReport({ token })
  if (args.includes('--write')) console.log(`Dependency issue: ${await syncDependencyIssue(report, { repository: process.env.GITHUB_REPOSITORY, token })}`)
  else console.log(renderDependencyReport(report))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
