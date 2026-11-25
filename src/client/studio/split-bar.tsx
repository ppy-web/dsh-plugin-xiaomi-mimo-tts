import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { STUDIO_ROLE_COLORS } from '../../types/studio.js'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface SplitSegment {
  id: string
  label: string
  value: number
  color?: string
}

export interface SplitBarProps {
  segments: readonly SplitSegment[]
  title?: string
  description?: string
  label?: string
  unit?: string
  totalLabel?: string
  offLabel?: string
  lastGuardLabel?: string
  formatValue?: (value: number) => string
  totalOverride?: string
  legend?: boolean
  toggleable?: boolean
  compact?: boolean
  hidden?: readonly string[]
  defaultHidden?: readonly string[]
  onHiddenChange?: (hidden: string[]) => void
  onSegmentClick?: (id: string) => void
  className?: string
  style?: CSSProperties
}

const FALLBACK_NEUTRALS = ['#64748b', '#94a3b8'] as const

function defaultSegmentColor(index: number, total: number): string {
  if (index >= 4 && index >= total - 2) {
    return FALLBACK_NEUTRALS[(index - (total - 2)) % FALLBACK_NEUTRALS.length]!
  }
  return STUDIO_ROLE_COLORS[index % STUDIO_ROLE_COLORS.length]!
}

function estimateTextWidthPx(text: string): number {
  let width = 0
  for (const ch of text) {
    width += ch.charCodeAt(0) > 255 ? 12.6 : 7.1
  }
  return width
}

function formatPercent(ratio: number): string {
  const pct = ratio * 100
  if (pct >= 99.95) return '100%'
  if (pct < 0.1 && pct > 0) return '<0.1%'
  return `${pct.toFixed(1)}%`
}

function cubicBezierY(t: number, x1: number, y1: number, x2: number, y2: number): number {
  let u = t
  for (let i = 0; i < 5; i += 1) {
    const inv = 1 - u
    const x = 3 * inv * inv * u * x1 + 3 * inv * u * u * x2 + u * u * u
    const dx = 3 * inv * inv * x1 + 6 * inv * u * (x2 - x1) + 3 * u * u * (1 - x2)
    if (Math.abs(dx) < 1e-5) break
    u = Math.max(0, Math.min(1, u - (x - t) / dx))
  }
  const inv = 1 - u
  return 3 * inv * inv * u * y1 + 3 * inv * u * u * y2 + u * u * u
}

function formatLeaderPath(anchorX: number, labelX: number): string {
  const x1 = anchorX.toFixed(1)
  const x2 = labelX.toFixed(1)
  return `M ${x1} 0 C ${x1} 10 ${x2} 6 ${x2} 15`
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const LEADER_ANIMATION_MS = 400

function LeaderPath({
  anchorX,
  labelX,
  color,
  dimmed,
  hidden,
}: {
  anchorX: number
  labelX: number
  color: string
  dimmed: boolean
  hidden: boolean
}): ReactElement {
  const pathRef = useRef<SVGPathElement>(null)
  const currentRef = useRef({ anchorX, labelX })

  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    const from = currentRef.current
    const dx1 = anchorX - from.anchorX
    const dx2 = labelX - from.labelX
    if (Math.abs(dx1) < 0.2 && Math.abs(dx2) < 0.2) {
      currentRef.current = { anchorX, labelX }
      el.setAttribute('d', formatLeaderPath(anchorX, labelX))
      return
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      currentRef.current = { anchorX, labelX }
      el.setAttribute('d', formatLeaderPath(anchorX, labelX))
      return
    }

    const startAnchor = from.anchorX
    const startLabel = from.labelX
    const startTime = performance.now()
    let rafId = 0

    const tick = (now: number): void => {
      const elapsed = Math.min(1, (now - startTime) / LEADER_ANIMATION_MS)
      const eased = cubicBezierY(elapsed, 0.22, 1, 0.36, 1)
      const nextAnchor = startAnchor + dx1 * eased
      const nextLabel = startLabel + dx2 * eased
      currentRef.current = { anchorX: nextAnchor, labelX: nextLabel }
      el.setAttribute('d', formatLeaderPath(nextAnchor, nextLabel))
      if (elapsed < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [anchorX, labelX])

  return (
    <path
      ref={pathRef}
      className="xmimo-split-bar-leader-path"
      data-dimmed={dimmed ? 'true' : undefined}
      data-hidden={hidden ? 'true' : undefined}
      style={{ '--seg-color': color } as CSSProperties}
      d={formatLeaderPath(currentRef.current.anchorX, currentRef.current.labelX)}
    />
  )
}

export type SplitBarLabelMode = 'full' | 'pct' | 'outside'

export interface ComputedSegment {
  id: string
  label: string
  value: number
  color: string
  rawRatio: number
  pctLabel: string
  startPct: number
  endPct: number
  widthPx: number
  baseLabelMode: SplitBarLabelMode
  displayLabelMode: SplitBarLabelMode
}

export interface OutsideCallout {
  id: string
  label: string
  color: string
  pctLabel: string
  anchorX: number
  labelX: number
  halfW: number
  hidden: boolean
}

export interface SplitBarLayout {
  computed: ComputedSegment[]
  outsideCallouts: OutsideCallout[]
  hasOutsideLane: boolean
}

const OUTSIDE_LABEL_MAX_NAME_PX = 180
const MIN_PCT_INSIDE_PX = 60

export function computeSplitBarLayout({
  visibleSegments,
  validSegments,
  trackWidth,
  activeId,
  compact,
}: {
  visibleSegments: readonly SplitSegment[]
  validSegments: readonly SplitSegment[]
  trackWidth: number
  activeId: string | null
  compact: boolean
}): SplitBarLayout {
  const totalValue = visibleSegments.reduce((sum, item) => sum + item.value, 0)
  if (visibleSegments.length === 0 || totalValue <= 0) {
    return { computed: [], outsideCallouts: [], hasOutsideLane: false }
  }

  const safeTrackWidth = Math.max(20, trackWidth)
  const rawRatios = visibleSegments.map(item => item.value / totalValue)
  const pctLabels = rawRatios.map(ratio => formatPercent(ratio))

  // Compute resting bounds and label modes purely from raw ratios so the outside lane height never bounces on hover.
  let rawAcc = 0
  const resting = visibleSegments.map((seg, idx) => {
    const rawRatio = rawRatios[idx]!
    const rawStartPct = rawAcc * 100
    rawAcc += rawRatio
    const rawEndPct = idx === visibleSegments.length - 1 ? 100 : rawAcc * 100
    const rawWidthPx = ((rawEndPct - rawStartPct) / 100) * safeTrackWidth
    const pctLabel = pctLabels[idx]!
    const fullNeeded = estimateTextWidthPx(seg.label) + estimateTextWidthPx(pctLabel) + 28
    const pctNeeded = Math.max(MIN_PCT_INSIDE_PX, estimateTextWidthPx(pctLabel) + 28)
    const outsideNameW = Math.min(OUTSIDE_LABEL_MAX_NAME_PX, estimateTextWidthPx(seg.label))
    const outsideEstWidth = outsideNameW + estimateTextWidthPx(pctLabel) + 14
    return {
      rawStartPct,
      rawEndPct,
      rawWidthPx,
      pctLabel,
      fullNeeded,
      pctNeeded,
      outsideEstWidth,
      baseLabelMode: 'outside' as SplitBarLabelMode,
    }
  })

  // Promote all non-'full' segments to outside callouts with leader lines whenever they fit cleanly in the lane;
  // only fall back to bare inline percentages when too many medium segments would crowd the lane.
  const nonFullIndices: number[] = []
  let nonFullCalloutsWidth = 0
  for (let i = 0; i < resting.length; i += 1) {
    const item = resting[i]!
    if (item.rawWidthPx >= item.fullNeeded) {
      item.baseLabelMode = 'full'
    } else {
      nonFullIndices.push(i)
      nonFullCalloutsWidth += item.outsideEstWidth
    }
  }
  const canFitAllNonFullOutside = !compact
    && nonFullIndices.length > 0
    && nonFullCalloutsWidth + Math.max(0, nonFullIndices.length - 1) * 8 <= safeTrackWidth * 0.92
  for (const idx of nonFullIndices) {
    const item = resting[idx]!
    item.baseLabelMode = canFitAllNonFullOutside
      ? 'outside'
      : !compact && item.rawWidthPx >= item.pctNeeded
        ? 'pct'
        : 'outside'
  }

  // Arc UI hover/focus widening: expand the hovered segment by +4.5% (or enough to fit its full label inside),
  // compressing siblings proportionally.
  let displayRatios = [...rawRatios]
  const activeIdx = activeId ? visibleSegments.findIndex(item => item.id === activeId) : -1
  if (activeIdx >= 0 && visibleSegments.length > 1) {
    const activeRest = resting[activeIdx]!
    const activeRaw = rawRatios[activeIdx]!
    const desiredPx = activeRest.fullNeeded + 6
    const minTargetRatio = Math.min(0.62, desiredPx / Math.max(220, safeTrackWidth))
    const boosted = Math.min(0.86, Math.max(activeRaw + 0.045, minTargetRatio))
    const delta = Math.max(0, boosted - activeRaw)
    const othersSum = 1 - activeRaw
    if (delta > 0.0005 && othersSum > 0.001) {
      displayRatios = rawRatios.map((r, idx) => (idx === activeIdx ? boosted : Math.max(0.012, r * ((1 - boosted) / othersSum))))
      const normSum = displayRatios.reduce((a, b) => a + b, 0)
      displayRatios = displayRatios.map(r => r / normSum)
    }
  }

  let acc = 0
  const computed: ComputedSegment[] = visibleSegments.map((seg, idx) => {
    const rest = resting[idx]!
    const ratio = displayRatios[idx]!
    const startPct = acc * 100
    acc += ratio
    const endPct = idx === visibleSegments.length - 1 ? 100 : acc * 100
    const widthPx = ((endPct - startPct) / 100) * safeTrackWidth
    const isActive = idx === activeIdx

    let displayLabelMode: SplitBarLabelMode = rest.baseLabelMode
    if (isActive && rest.baseLabelMode !== 'full') {
      if (widthPx >= rest.fullNeeded) displayLabelMode = 'full'
      else if (widthPx >= rest.pctNeeded) displayLabelMode = 'pct'
    }

    const paletteIdx = validSegments.findIndex(item => item.id === seg.id)
    return {
      id: seg.id,
      label: seg.label,
      value: seg.value,
      color: seg.color ?? defaultSegmentColor(paletteIdx >= 0 ? paletteIdx : idx, validSegments.length),
      rawRatio: rawRatios[idx]!,
      pctLabel: rest.pctLabel,
      startPct,
      endPct,
      widthPx,
      baseLabelMode: rest.baseLabelMode,
      displayLabelMode,
    }
  })

  if (compact) {
    return { computed, outsideCallouts: [], hasOutsideLane: false }
  }

  // Keep resting outside callouts mounted in the reserved 40px lane so hovering never collapses the lane height and
  // bounces the legend below; when a narrow segment expands on hover to show inside the bar, its callout fades out.
  const outsideCallouts: OutsideCallout[] = computed
    .map((seg, idx) => ({ seg, rest: resting[idx]! }))
    .filter(({ seg }) => seg.baseLabelMode === 'outside')
    .map(({ seg, rest }) => {
      const restAnchorX = ((rest.rawStartPct + rest.rawEndPct) / 200) * safeTrackWidth
      const anchorX = ((seg.startPct + seg.endPct) / 200) * safeTrackWidth
      return {
        id: seg.id,
        label: seg.label,
        color: seg.color,
        pctLabel: seg.pctLabel,
        anchorX,
        labelX: restAnchorX,
        halfW: rest.outsideEstWidth / 2,
        hidden: seg.displayLabelMode !== 'outside',
      }
    })

  if (outsideCallouts.length > 0) {
    const pad = 8
    for (let i = 0; i < outsideCallouts.length; i += 1) {
      const cur = outsideCallouts[i]!
      cur.labelX = Math.max(cur.halfW + 2, Math.min(safeTrackWidth - cur.halfW - 2, cur.labelX))
      if (i > 0) {
        const prev = outsideCallouts[i - 1]!
        const minX = prev.labelX + prev.halfW + cur.halfW + pad
        if (cur.labelX < minX) cur.labelX = minX
      }
    }
    for (let i = outsideCallouts.length - 1; i >= 0; i -= 1) {
      const cur = outsideCallouts[i]!
      if (cur.labelX + cur.halfW > safeTrackWidth - 2) {
        cur.labelX = Math.max(cur.halfW + 2, safeTrackWidth - cur.halfW - 2)
      }
      if (i > 0) {
        const prev = outsideCallouts[i - 1]!
        const maxPrevX = cur.labelX - cur.halfW - prev.halfW - pad
        if (prev.labelX > maxPrevX) prev.labelX = Math.max(prev.halfW + 2, maxPrevX)
      }
    }
  }

  return {
    computed,
    outsideCallouts,
    hasOutsideLane: outsideCallouts.length > 0,
  }
}

export function SplitBar({
  segments,
  title,
  description,
  label,
  unit,
  totalLabel = '总计',
  offLabel = '隐藏',
  lastGuardLabel = '至少保留一项显示',
  formatValue,
  totalOverride,
  legend = true,
  toggleable = false,
  compact = false,
  hidden: controlledHidden,
  defaultHidden = [],
  onHiddenChange,
  onSegmentClick,
  className,
  style,
}: SplitBarProps): ReactElement | null {
  const validSegments = useMemo(
    () => segments.filter(item => Number.isFinite(item.value) && item.value > 0),
    [segments],
  )
  const [uncontrolledHidden, setUncontrolledHidden] = useState<string[]>(() => [...defaultHidden])
  const hiddenIds = useMemo(
    () => new Set(controlledHidden ?? uncontrolledHidden),
    [controlledHidden, uncontrolledHidden],
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [guardNotice, setGuardNotice] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(420)

  useIsomorphicLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const update = () => {
      const next = el.getBoundingClientRect().width
      if (next > 20) setTrackWidth(next)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visibleSegments = useMemo(
    () => validSegments.filter(item => !hiddenIds.has(item.id)),
    [validSegments, hiddenIds],
  )

  const totalValue = useMemo(
    () => visibleSegments.reduce((sum, item) => sum + item.value, 0),
    [visibleSegments],
  )

  const effectiveActiveId = activeId && visibleSegments.some(item => item.id === activeId) ? activeId : null

  const { computed, outsideCallouts, hasOutsideLane } = useMemo(
    () => computeSplitBarLayout({
      visibleSegments,
      validSegments,
      trackWidth,
      activeId: effectiveActiveId,
      compact,
    }),
    [visibleSegments, validSegments, trackWidth, effectiveActiveId, compact],
  )

  if (validSegments.length === 0) return null

  const formatNum = (num: number): string => formatValue ? formatValue(num) : num.toLocaleString()
  const activeSeg = effectiveActiveId ? computed.find(item => item.id === effectiveActiveId) ?? null : null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (computed.length === 0) return
    const currentIndex = effectiveActiveId ? computed.findIndex(item => item.id === effectiveActiveId) : -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      const next = computed[(currentIndex + 1) % computed.length]
      if (next) setActiveId(next.id)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = computed[(currentIndex <= 0 ? computed.length - 1 : currentIndex - 1)]
      if (next) setActiveId(next.id)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveId(computed[0]!.id)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveId(computed[computed.length - 1]!.id)
    } else if (event.key === 'Escape') {
      setActiveId(null)
    } else if ((event.key === 'Enter' || event.key === ' ') && effectiveActiveId && onSegmentClick) {
      event.preventDefault()
      onSegmentClick(effectiveActiveId)
    }
  }

  const handleLegendClick = (id: string): void => {
    if (!toggleable) {
      onSegmentClick?.(id)
      return
    }
    const isOff = hiddenIds.has(id)
    if (!isOff && visibleSegments.length <= 1) {
      setShakeId(id)
      setGuardNotice(lastGuardLabel)
      window.setTimeout(() => setShakeId(current => (current === id ? null : current)), 260)
      return
    }
    setGuardNotice(null)
    const next = isOff
      ? [...hiddenIds].filter(item => item !== id)
      : [...hiddenIds, id]
    if (controlledHidden === undefined) setUncontrolledHidden(next)
    onHiddenChange?.(next)
  }

  return (
    <figure
      className={`xmimo-split-bar${compact ? ' xmimo-split-bar-compact' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {(title || description || totalValue > 0) ? (
        <div className="xmimo-split-bar-head">
          {(title || description) ? (
            <div className="xmimo-split-bar-heading">
              {title ? <span className="xmimo-split-bar-title">{title}</span> : null}
              {description ? <span className="xmimo-split-bar-desc">{description}</span> : null}
            </div>
          ) : <span />}
          <div className="xmimo-split-bar-readout" aria-live="polite">
            <span key={activeSeg ? activeSeg.id : '__total__'} className="xmimo-split-bar-readout-line">
              {activeSeg ? (
                <>
                  <span className="xmimo-split-bar-readout-swatch" style={{ '--seg-color': activeSeg.color } as CSSProperties} aria-hidden="true" />
                  <span>{activeSeg.label}</span>
                  <span className="xmimo-split-bar-readout-pct">{activeSeg.pctLabel}</span>
                  <strong>{formatNum(activeSeg.value)}</strong>
                  {unit ? <span>{unit}</span> : null}
                </>
              ) : (
                <>
                  <span>{totalLabel}</span>
                  <strong>{totalOverride ?? formatNum(totalValue)}</strong>
                  {unit ? <span>{unit}</span> : null}
                </>
              )}
            </span>
          </div>
        </div>
      ) : null}

      <div
        ref={trackRef}
        className="xmimo-split-bar-track"
        tabIndex={0}
        role="group"
        aria-roledescription="split bar"
        aria-label={label ?? title ?? totalLabel}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setActiveId(null)}
        onBlur={() => setActiveId(null)}
      >
        {computed.map((seg, idx) => {
          const leftGapPx = idx === 0 ? 0 : 1
          const rightGapPx = idx === computed.length - 1 ? 0 : 1
          const rightInsetPct = Math.max(0, 100 - seg.endPct)
          const leftInsetPct = Math.max(0, seg.startPct)
          const clipPath = `inset(0px calc(${rightInsetPct.toFixed(3)}% + ${rightGapPx}px) 0px calc(${leftInsetPct.toFixed(3)}% + ${leftGapPx}px) round 5px)`
          const startPx = (seg.startPct / 100) * trackWidth + leftGapPx
          const endPx = (seg.endPct / 100) * trackWidth - rightGapPx
          const isActive = effectiveActiveId === seg.id
          const isDimmed = effectiveActiveId !== null && !isActive

          return (
            <div
              key={seg.id}
              className="xmimo-split-bar-segment"
              data-active={isActive ? 'true' : undefined}
              data-dimmed={isDimmed ? 'true' : undefined}
              style={{
                '--seg-color': seg.color,
                clipPath,
              } as CSSProperties}
              onMouseEnter={() => setActiveId(seg.id)}
              onClick={() => {
                setActiveId(seg.id)
                onSegmentClick?.(seg.id)
              }}
            >
              {seg.displayLabelMode !== 'outside' ? (
                <span
                  className="xmimo-split-bar-inside"
                  style={{
                    transform: `translateX(${Math.max(0, startPx + 10).toFixed(1)}px)`,
                    maxWidth: `${Math.max(0, seg.widthPx - 18).toFixed(1)}px`,
                  }}
                >
                  {seg.displayLabelMode === 'full' ? (
                    <span className="xmimo-split-bar-inside-name">{seg.label}</span>
                  ) : null}
                  <span className="xmimo-split-bar-inside-pct">{seg.pctLabel}</span>
                </span>
              ) : null}
              <span
                className="xmimo-split-bar-cap"
                style={{ transform: `translateX(${Math.max(0, endPx - 3).toFixed(1)}px)` }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>

      {!compact ? (
        <div
          className={`xmimo-split-bar-lane${hasOutsideLane ? ' xmimo-split-bar-lane-open' : ''}`}
          aria-hidden="true"
        >
          <svg className="xmimo-split-bar-leaders" viewBox={`0 0 ${Math.max(1, trackWidth)} 40`} preserveAspectRatio="none" aria-hidden="true">
            {outsideCallouts.map(item => (
              <LeaderPath
                key={item.id}
                anchorX={item.anchorX}
                labelX={item.labelX}
                color={item.color}
                dimmed={effectiveActiveId !== null && effectiveActiveId !== item.id}
                hidden={item.hidden}
              />
            ))}
          </svg>
          {outsideCallouts.map(item => {
            const isItemDimmed = effectiveActiveId !== null && effectiveActiveId !== item.id
            return (
              <span
                key={item.id}
                className="xmimo-split-bar-outside"
                data-dimmed={isItemDimmed ? 'true' : undefined}
                data-hidden={item.hidden ? 'true' : undefined}
                style={{ left: `${item.labelX.toFixed(1)}px` }}
              >
                <span className="xmimo-split-bar-outside-name">{item.label}</span>
                <strong>{item.pctLabel}</strong>
              </span>
            )
          })}
        </div>
      ) : null}

      {legend ? (
        <ul className="xmimo-split-bar-legend">
          {validSegments.map((seg, idx) => {
            const isOff = hiddenIds.has(seg.id)
            const comp = computed.find(item => item.id === seg.id)
            const color = seg.color ?? defaultSegmentColor(idx, validSegments.length)
            return (
              <li key={seg.id}>
                <button
                  type="button"
                  className={`xmimo-split-bar-legend-btn${shakeId === seg.id ? ' xmimo-split-bar-legend-shake' : ''}`}
                  aria-pressed={toggleable ? !isOff : undefined}
                  data-active={effectiveActiveId === seg.id ? 'true' : undefined}
                  onMouseEnter={() => { if (!isOff) setActiveId(seg.id) }}
                  onMouseLeave={() => setActiveId(null)}
                  onClick={() => handleLegendClick(seg.id)}
                >
                  <span
                    className={`xmimo-split-bar-swatch${isOff ? ' xmimo-split-bar-swatch-off' : ''}`}
                    style={{ '--seg-color': color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className="xmimo-split-bar-legend-name">{seg.label}</span>
                  <span className="xmimo-split-bar-legend-pct">
                    {isOff ? offLabel : comp?.pctLabel ?? '0%'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {guardNotice ? (
        <span className="xmimo-split-bar-desc" role="status" aria-live="polite">{guardNotice}</span>
      ) : null}
    </figure>
  )
}
