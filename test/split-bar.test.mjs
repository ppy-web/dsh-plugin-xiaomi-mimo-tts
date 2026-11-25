import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { SplitBar, computeSplitBarLayout } = await loadClientModule('src/client/studio/split-bar.tsx')

const ARCHIVE_SEGMENTS = [
  { id: 'narrator', label: '旁白 · 沉稳男声', value: 29.0 },
  { id: 'bingtang', label: '冰糖 · 元气少女', value: 4.3 },
  { id: 'moli', label: '茉莉 · 知性解说', value: 32.5 },
]

test('SplitBar shows narrow outside callout by default, widens any hovered segment to reveal inside content, and keeps lane height stable', () => {
  for (const trackWidth of [560, 680, 740, 820, 1000, 1280]) {
    const resting = computeSplitBarLayout({
      visibleSegments: ARCHIVE_SEGMENTS,
      validSegments: ARCHIVE_SEGMENTS,
      trackWidth,
      activeId: null,
      compact: false,
    })

    assert.equal(resting.hasOutsideLane, true, `width ${trackWidth} should show outside callout by default`)
    assert.deepEqual(resting.outsideCallouts.map(item => item.id), ['bingtang'])
    assert.equal(resting.outsideCallouts[0].hidden, false)

    const restCallout = resting.outsideCallouts[0]
    const restMid = resting.computed.find(seg => seg.id === 'bingtang')
    const restMoli = resting.computed.find(seg => seg.id === 'moli')
    assert.equal(restMid.baseLabelMode, 'outside')
    assert.equal(restMid.displayLabelMode, 'outside')

    // Hovering wide segment widens it by ~4.5% (Arc UI feel) while keeping the outside lane open and callout visible
    const hoverMoli = computeSplitBarLayout({
      visibleSegments: ARCHIVE_SEGMENTS,
      validSegments: ARCHIVE_SEGMENTS,
      trackWidth,
      activeId: 'moli',
      compact: false,
    })
    assert.equal(hoverMoli.hasOutsideLane, true)
    assert.equal(hoverMoli.outsideCallouts[0].hidden, false)
    assert.equal(hoverMoli.outsideCallouts[0].labelX, restCallout.labelX)
    const activeMoli = hoverMoli.computed.find(seg => seg.id === 'moli')
    assert.ok(activeMoli.widthPx > restMoli.widthPx, 'hovering wide segment should elastically widen it')

    // Hovering narrow segment widens it to reveal its full label inside the bar, fades its outside callout,
    // and preserves hasOutsideLane = true so the legend below never jumps vertically
    const hoverMid = computeSplitBarLayout({
      visibleSegments: ARCHIVE_SEGMENTS,
      validSegments: ARCHIVE_SEGMENTS,
      trackWidth,
      activeId: 'bingtang',
      compact: false,
    })
    assert.equal(hoverMid.hasOutsideLane, true)
    assert.equal(hoverMid.outsideCallouts[0].hidden, true)
    assert.equal(hoverMid.outsideCallouts[0].labelX, restCallout.labelX)
    const activeMid = hoverMid.computed.find(seg => seg.id === 'bingtang')
    assert.equal(activeMid.displayLabelMode, 'full', `width ${trackWidth}: hovering narrow segment should reveal its full label inside`)
    assert.ok(activeMid.widthPx > restMid.widthPx)
  }
})

test('SplitBar falls back to inline percentages when many medium segments would crowd the outside lane and never pops lane on hover', () => {
  const crowdedSegments = [
    { id: 'r1', label: '角色一号 · 播客主持', value: 1 },
    { id: 'r2', label: '角色二号 · 播客嘉宾', value: 1 },
    { id: 'r3', label: '角色三号 · 纪录片旁白', value: 1 },
    { id: 'r4', label: '角色四号 · 元气少女', value: 1 },
    { id: 'r5', label: '角色五号 · 知性解说', value: 1 },
    { id: 'r6', label: '角色六号 · 深夜电台', value: 1 },
  ]
  const resting = computeSplitBarLayout({
    visibleSegments: crowdedSegments,
    validSegments: crowdedSegments,
    trackWidth: 700,
    activeId: null,
    compact: false,
  })
  assert.equal(resting.hasOutsideLane, false)
  assert.ok(resting.computed.every(seg => seg.baseLabelMode === 'pct'))

  for (const seg of crowdedSegments) {
    const hovered = computeSplitBarLayout({
      visibleSegments: crowdedSegments,
      validSegments: crowdedSegments,
      trackWidth: 700,
      activeId: seg.id,
      compact: false,
    })
    assert.equal(hovered.hasOutsideLane, false)
    assert.equal(hovered.outsideCallouts.length, 0)
    const active = hovered.computed.find(item => item.id === seg.id)
    assert.equal(active.displayLabelMode, 'full')
    assert.ok(active.widthPx > resting.computed[0].widthPx)
  }
})

test('SplitBar renders SVG leader path attribute and non-interactive outside callout by default, and omits lane in compact mode', () => {
  const normalHtml = renderToStaticMarkup(createElement(SplitBar, { segments: ARCHIVE_SEGMENTS }))
  assert.match(normalHtml, /xmimo-split-bar-lane-open/)
  assert.match(normalHtml, /<path[^>]*class="xmimo-split-bar-leader-path"[^>]*d="M /)
  assert.match(normalHtml, /<span[^>]*class="xmimo-split-bar-outside"/)
  assert.match(normalHtml, /冰糖 · 元气少女/)

  const compactHtml = renderToStaticMarkup(createElement(SplitBar, { segments: ARCHIVE_SEGMENTS, compact: true }))
  assert.doesNotMatch(compactHtml, /xmimo-split-bar-lane/)
})
