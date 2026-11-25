import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { StudioTasksTab } = await loadClientModule('src/client/studio/studio-tasks-tab.tsx')
const { StudioScriptsTab } = await loadClientModule('src/client/studio/studio-scripts-tab.tsx')
const { StudioModule } = await loadClientModule('src/client/settings/studio-module.tsx')
const { studioClient } = await loadClientModule('src/client/studio/studio-client-store.ts')
const { createBuiltinStudioRoles } = await loadClientModule('src/types/studio.ts')
const { createBuiltinStudioScripts } = await loadClientModule('src/studio-presets.ts')

function makeCompletedTask(id, title, completedAt) {
  return {
    id,
    title,
    status: 'completed',
    createdAt: completedAt - 60_000,
    updatedAt: completedAt,
    completedAt,
    totalLines: 4,
    completedLines: 4,
    failedLines: 0,
    durationMs: 69_000,
    audioSize: 3_450_000,
    lines: [
      {
        lineId: `${id}-1`,
        roleId: 'role-a',
        roleName: '陆远山',
        roleColor: '#3b82f6',
        provider: 'xiaomi',
        model: 'mimo-v2.5-tts',
        voice: '白桦',
        voiceRate: 1,
        text: '开场白',
        pauseAfterMs: 400,
        status: 'completed',
        durationMs: 30_000,
        startMs: 0,
        endMs: 30_000,
      },
      {
        lineId: `${id}-2`,
        roleId: 'role-b',
        roleName: '冰糖',
        roleColor: '#ec4899',
        provider: 'xiaomi',
        model: 'mimo-v2.5-tts',
        voice: '冰糖',
        voiceRate: 1,
        text: '回应',
        pauseAfterMs: 400,
        status: 'completed',
        durationMs: 39_000,
        startMs: 30_000,
        endMs: 69_000,
      },
    ],
  }
}

test('StudioTasksTab places archive open/close toggle inline immediately before the download action and shows copyable storage root', () => {
  const task = makeCompletedTask('archive-1', '视频配音剧本', 1_760_000_000_000)
  const storageRoot = 'C:\\Users\\demo\\.dsh-xiaomi-tts\\studio\\profiles\\abc123'
  const html = renderToStaticMarkup(createElement(StudioTasksTab, {
    t: key => key,
    tasks: [task],
    storageBytes: task.audioSize,
    maxStorageBytes: 1024 * 1024 * 1024,
    storageRoot,
    volume: 1,
    beforePlayback: () => true,
    onGoScripts: () => {},
    onDeleteError: () => {},
  }))

  const controlsStart = html.indexOf('xmimo-studio-task-controls')
  const togglePos = html.indexOf('xmimo-studio-task-details-toggle')
  const downloadPos = html.indexOf('xmimo-studio-download-link')
  const detailsPos = html.indexOf('xmimo-studio-task-details"')

  assert.ok(controlsStart >= 0, 'task controls toolbar should render')
  assert.ok(togglePos > controlsStart, 'toggle button should be inside task controls toolbar')
  assert.ok(downloadPos > togglePos, 'toggle button should appear to the left of download link')
  assert.ok(detailsPos > downloadPos, 'expanded details panel should follow header controls')
  assert.ok(html.includes(storageRoot), 'storage root path should be rendered')
  assert.match(html, /xmimo-studio-storage-copy/)
})

test('StudioModule renders recent archive cards without a section heading and marks only the latest archive NEW', () => {
  const prevSnapshot = studioClient.getSnapshot()
  const older = makeCompletedTask('archive-old', '男女对谈播客', 1_760_000_000_000)
  const latest = makeCompletedTask('archive-new', '视频配音剧本', 1_760_001_000_000)

  studioClient.getSnapshot = () => ({
    ...prevSnapshot,
    tasks: [older, latest],
  })
  try {
    const html = renderToStaticMarkup(createElement(StudioModule, {
      t: key => key,
      open: true,
      volume: 1,
      onToggleOpen: () => {},
      onOpenStudio: () => {},
    }))

    // No visible <h3> recent archives title
    assert.doesNotMatch(html, /<h3>studio\.card\.recentArchives<\/h3>/)

    // Exactly one NEW badge attached to the latest archive (first card)
    const badges = html.match(/xmimo-tts-studio-new-tag/g) ?? []
    assert.equal(badges.length, 1)
    const latestPos = html.indexOf('视频配音剧本')
    const badgePos = html.indexOf('xmimo-tts-studio-new-tag')
    const olderPos = html.indexOf('男女对谈播客')
    assert.ok(latestPos >= 0 && badgePos > latestPos && olderPos > badgePos)

    // Cards surface key archive metadata (roles, duration, line count, file size)
    assert.match(html, /陆远山/)
    assert.match(html, /冰糖/)
    assert.match(html, /01:09/)
    assert.match(html, /4 studio\.splitBar\.linesUnit/)
    assert.match(html, /MB/)
  } finally {
    studioClient.getSnapshot = () => prevSnapshot
  }
})

test('StudioScriptsTab renders an enabled control for each built-in example script', () => {
  const roles = createBuiltinStudioRoles(1_760_000_000_000)
  const scripts = createBuiltinStudioScripts(1_760_000_000_000)
  assert.ok(scripts.length > 0)

  const html = renderToStaticMarkup(createElement(StudioScriptsTab, {
    t: key => key,
    roles,
    scripts,
    keyStatuses: { xiaomi: 'recognized', doubao: 'missing', breeze: 'missing', deepseek: 'missing' },
    mossEnabled: false,
    rehearsingLineId: null,
    rehearsingSequence: false,
    onPreviewLine: () => {},
    onToggleRehearseAll: () => {},
    onTaskStarted: () => {},
    onConfigureProvider: () => {},
    onDeleteError: () => {},
  }))

  const buttons = Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g))
  for (const script of scripts) {
    const title = renderToStaticMarkup(script.title)
    assert.ok(buttons.some(([, attributes, content]) =>
      !/\sdisabled(?:=|\s|$)/.test(attributes) && content.includes(title),
    ), `no enabled control for example script: ${script.title}`)
  }
})
