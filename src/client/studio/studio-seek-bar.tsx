import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from 'react'
import { historyTime } from '../history/history-list.js'

export interface StudioSeekChapter {
  id: string
  startMs: number
  endMs: number
  roleName: string
  roleColor: string
}

export interface StudioSeekBarProps {
  currentTime: number
  duration: number
  active: boolean
  playing: boolean
  chapters: readonly StudioSeekChapter[]
  ariaLabel: string
  onSeek: (timeSec: number) => void
  onScrubChange?: (timeSec: number | null) => void
}

interface TrackSpan {
  key: string
  leftPct: number
  widthPct: number
  color: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildTrackSpans(chapters: readonly StudioSeekChapter[], totalMs: number): { spans: TrackSpan[]; showDividers: boolean } {
  if (totalMs <= 0 || chapters.length === 0) return { spans: [], showDividers: false }
  const raw: { key: string; startMs: number; endMs: number; color: string }[] = []
  for (const chapter of chapters) {
    if (chapter.endMs <= chapter.startMs) continue
    raw.push({
      key: chapter.id,
      startMs: clamp(chapter.startMs, 0, totalMs),
      endMs: clamp(chapter.endMs, 0, totalMs),
      color: chapter.roleColor,
    })
  }
  if (raw.length === 0) return { spans: [], showDividers: false }

  const showDividers = raw.length <= 60
  const items = showDividers
    ? raw
    : raw.reduce<typeof raw>((acc, cur) => {
      const prev = acc.at(-1)
      if (prev && prev.color === cur.color && Math.abs(cur.startMs - prev.endMs) <= 20) {
        prev.endMs = Math.max(prev.endMs, cur.endMs)
      } else {
        acc.push({ ...cur })
      }
      return acc
    }, [])

  const spans = items.map(item => ({
    key: item.key,
    leftPct: (item.startMs / totalMs) * 100,
    widthPct: Math.max(0.25, ((item.endMs - item.startMs) / totalMs) * 100),
    color: item.color,
  }))
  return { spans, showDividers }
}

function findChapterAtMs(chapters: readonly StudioSeekChapter[], ms: number): StudioSeekChapter | null {
  if (chapters.length === 0) return null
  for (const chapter of chapters) {
    if (ms >= chapter.startMs && ms < chapter.endMs) return chapter
  }
  const last = chapters.at(-1)
  if (last && ms >= last.startMs && ms <= last.endMs) return last
  return null
}

export function StudioSeekBar({
  currentTime,
  duration,
  active,
  playing,
  chapters,
  ariaLabel,
  onSeek,
  onScrubChange,
}: StudioSeekBarProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  const disabled = !Number.isFinite(duration) || duration <= 0
  const maxChapterMs = useMemo(
    () => chapters.reduce((max, item) => Math.max(max, item.endMs), 0),
    [chapters],
  )
  const totalMs = Math.max(disabled ? 0 : duration * 1000, maxChapterMs)

  const { spans, showDividers } = useMemo(
    () => buildTrackSpans(chapters, totalMs),
    [chapters, totalMs],
  )

  const displayTime = dragging && dragTime !== null
    ? dragTime
    : (active ? clamp(currentTime, 0, disabled ? 0 : duration) : 0)
  const pct = disabled ? 0 : clamp((displayTime / duration) * 100, 0, 100)

  const activeChapter = useMemo(
    () => (active || dragging ? findChapterAtMs(chapters, displayTime * 1000) : null),
    [active, dragging, chapters, displayTime],
  )

  const previewTime = dragging ? dragTime : hoverTime
  const previewPct = previewTime !== null && !disabled ? clamp((previewTime / duration) * 100, 0, 100) : null
  const previewChapter = useMemo(
    () => (previewTime !== null ? findChapterAtMs(chapters, previewTime * 1000) : null),
    [chapters, previewTime],
  )

  const timeFromClientX = useCallback((clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || disabled) return 0
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return ratio * duration
  }, [disabled, duration])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore unsupported capture */ }
    const next = timeFromClientX(event.clientX)
    draggingRef.current = true
    setDragging(true)
    setDragTime(next)
    setHoverTime(next)
    onScrubChange?.(next)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    const next = timeFromClientX(event.clientX)
    setHoverTime(next)
    if (draggingRef.current) {
      setDragTime(next)
      onScrubChange?.(next)
    }
  }

  const finishDrag = (commit: boolean, clientX?: number): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const finalTime = clientX !== undefined ? timeFromClientX(clientX) : dragTime
    setDragging(false)
    setDragTime(null)
    onScrubChange?.(null)
    if (commit && finalTime !== null) {
      onSeek(finalTime)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    const step = event.shiftKey ? 15 : 5
    let next: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamp(displayTime - step, 0, duration)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamp(displayTime + step, 0, duration)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = duration
    if (next === null) return
    event.preventDefault()
    onSeek(next)
  }

  const rootStyle = {
    '--seek-pct': `${pct}`,
    ...(activeChapter?.roleColor ? { '--seek-accent': activeChapter.roleColor } : {}),
    ...(previewPct !== null ? { '--hover-pct': `${previewPct}` } : {}),
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-valuemin={0}
      aria-valuemax={Math.round((disabled ? 0 : duration) * 10) / 10}
      aria-valuenow={Math.round(displayTime * 10) / 10}
      aria-valuetext={`${historyTime(displayTime)} / ${historyTime(disabled ? 0 : duration)}`}
      className="xmimo-studio-seek"
      data-active={active ? 'true' : undefined}
      data-playing={playing ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={rootStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishDrag(true, event.clientX)}
      onPointerCancel={() => finishDrag(false)}
      onLostPointerCapture={() => { if (draggingRef.current) finishDrag(false) }}
      onPointerLeave={() => { if (!draggingRef.current) setHoverTime(null) }}
      onKeyDown={handleKeyDown}
    >
      {previewTime !== null && previewPct !== null ? (
        <div className="xmimo-studio-seek-tooltip" aria-hidden="true">
          {previewChapter ? (
            <>
              <span className="xmimo-studio-seek-tooltip-dot" style={{ '--seg-color': previewChapter.roleColor } as CSSProperties} />
              <span className="xmimo-studio-seek-tooltip-role">{previewChapter.roleName}</span>
              <span className="xmimo-studio-seek-tooltip-sep">·</span>
            </>
          ) : null}
          <span className="xmimo-studio-seek-tooltip-time">{historyTime(previewTime)}</span>
        </div>
      ) : null}

      <div className="xmimo-studio-seek-rail" aria-hidden="true">
        {spans.length > 0 ? (
          <div className="xmimo-studio-seek-chapters" data-dividers={showDividers ? 'true' : undefined}>
            {spans.map(span => (
              <span
                key={span.key}
                className="xmimo-studio-seek-chapter"
                style={{ left: `${span.leftPct}%`, width: `${span.widthPct}%`, '--seg-color': span.color } as CSSProperties}
              />
            ))}
          </div>
        ) : null}

        <div className="xmimo-studio-seek-fill">
          {spans.length > 0 ? (
            spans.map(span => (
              <span
                key={span.key}
                className="xmimo-studio-seek-fill-chapter"
                style={{ left: `${span.leftPct}%`, width: `${span.widthPct}%`, '--seg-color': span.color } as CSSProperties}
              />
            ))
          ) : (
            <span className="xmimo-studio-seek-fill-solid" />
          )}
        </div>

        {!dragging && previewPct !== null ? <span className="xmimo-studio-seek-ghost" /> : null}
      </div>

      <span className="xmimo-studio-seek-thumb" aria-hidden="true" />
    </div>
  )
}
