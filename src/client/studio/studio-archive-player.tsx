import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiPauseMiniFill, RiPlayMiniFill } from 'react-icons/ri'
import type { StudioTask } from '../../types/studio.js'
import { historyTime } from '../history/history-list.js'
import type { Translate } from '../localization.js'
import { SplitBar } from './split-bar.js'
import type { SplitSegment } from './split-bar.js'
import { studioClient } from './studio-client-store.js'
import { StudioSeekBar } from './studio-seek-bar.js'
import type { StudioSeekChapter } from './studio-seek-bar.js'
import { studioWorkspaceStore } from './studio-workspace-store.js'

function buildArchiveCastSegments(task: StudioTask): SplitSegment[] {
  const byRole = new Map<string, { label: string; color: string; ms: number }>()
  for (const line of task.lines) {
    const ms = line.durationMs ?? Math.max(0, (line.endMs ?? 0) - (line.startMs ?? 0))
    if (ms <= 0) continue
    const cur = byRole.get(line.roleId)
    if (cur) cur.ms += ms
    else byRole.set(line.roleId, { label: line.roleName, color: line.roleColor, ms })
  }
  return [...byRole.entries()].map(([id, item]) => ({
    id,
    label: item.label,
    color: item.color,
    value: Math.max(1, Math.round(item.ms / 100) / 10),
  }))
}

function formatLineTime(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return '--:--'
  return historyTime(ms / 1000)
}

export function StudioArchivePlayer({ t, task, volume, beforePlayback }: {
  t: Translate
  task: StudioTask
  volume: number
  beforePlayback: () => boolean
}): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingSeek = useRef<number | null>(null)
  const timelineRef = useRef<HTMLUListElement>(null)
  const [currentTime, setCurrentTime] = useState(() => {
    const bookmark = studioWorkspaceStore.getSnapshot().playback
    return bookmark.activeTaskId === task.id ? bookmark.currentTime : 0
  })
  const [duration, setDuration] = useState((task.durationMs ?? 0) / 1000)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackError, setPlaybackError] = useState(false)
  const [scrubbing, setScrubbing] = useState<number | null>(null)
  const position = useRef(currentTime)
  position.current = currentTime

  const castSegments = useMemo(() => buildArchiveCastSegments(task), [task])
  const chapters = useMemo<StudioSeekChapter[]>(() => task.lines.flatMap((line, index) => (
    line.startMs !== undefined && line.endMs !== undefined && line.endMs > line.startMs
      ? [{ id: line.lineId + '-' + index, startMs: line.startMs, endMs: line.endMs, roleName: line.roleName, roleColor: line.roleColor }]
      : []
  )), [task.lines])
  const displayedTime = scrubbing ?? currentTime
  const lineIndex = audioRef.current || displayedTime > 0 || scrubbing !== null
    ? task.lines.findIndex(line => line.startMs !== undefined && line.endMs !== undefined
      && displayedTime * 1000 >= line.startMs && displayedTime * 1000 < line.endMs)
    : -1

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  useEffect(() => {
    if (!isPlaying) return
    let frame = 0
    const tick = (): void => {
      if (audioRef.current && pendingSeek.current === null) setCurrentTime(audioRef.current.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying || lineIndex < 0 || scrubbing !== null) return
    const list = timelineRef.current
    const row = list?.children[lineIndex]
    if (!list || !row) return
    const visible = list.getBoundingClientRect()
    const target = row.getBoundingClientRect()
    if (target.top < visible.top) list.scrollTop += target.top - visible.top
    else if (target.bottom > visible.bottom) list.scrollTop += target.bottom - visible.bottom
  }, [isPlaying, lineIndex, scrubbing])

  useEffect(() => () => {
    const audio = audioRef.current
    if (!audio) return
    if (studioClient.getSnapshot().tasks.some(item => item.id === task.id)) {
      studioWorkspaceStore.setPlaybackBookmark(task.id, pendingSeek.current ?? audio.currentTime, true)
    }
    audioRef.current = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }, [task.id])

  const ensureAudio = (): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = Math.min(1, Math.max(0, volume))
    audioRef.current = audio
    audio.addEventListener('loadedmetadata', () => {
      if (audioRef.current !== audio) return
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
      if (pendingSeek.current !== null) {
        audio.currentTime = Math.min(pendingSeek.current, audio.duration || pendingSeek.current)
        pendingSeek.current = null
        setCurrentTime(audio.currentTime)
      }
    })
    audio.addEventListener('timeupdate', () => {
      if (audioRef.current === audio && pendingSeek.current === null) setCurrentTime(audio.currentTime)
    })
    audio.addEventListener('play', () => { if (audioRef.current === audio) setIsPlaying(true) })
    audio.addEventListener('pause', () => { if (audioRef.current === audio) setIsPlaying(false) })
    audio.addEventListener('ended', () => { if (audioRef.current === audio) setIsPlaying(false) })
    audio.addEventListener('error', () => {
      if (audioRef.current !== audio) return
      setPlaybackError(true)
      setIsPlaying(false)
    })
    return audio
  }

  const seek = (audio: HTMLAudioElement, seconds: number): void => {
    const target = Math.min(Math.max(0, seconds), duration || seconds)
    if (audio.readyState < 1) pendingSeek.current = target
    else audio.currentTime = target
    setCurrentTime(target)
  }

  const play = (seconds?: number): void => {
    if (!beforePlayback()) return
    const audio = ensureAudio()
    setPlaybackError(false)
    if (!audio.src || audio.error) {
      audio.src = studioClient.audioUrl(task.id)
      seek(audio, seconds ?? position.current)
    } else if (seconds !== undefined) seek(audio, seconds)
    void audio.play().catch((error: unknown) => {
      if (audioRef.current !== audio || (error instanceof DOMException && error.name === 'AbortError')) return
      setPlaybackError(true)
      setIsPlaying(false)
    })
  }

  return (
    <>
      <SplitBar
        segments={castSegments}
        title={t('studio.share.title')}
        description={t('studio.share.archiveDesc')}
        totalLabel={t('studio.splitBar.total')}
        unit={t('studio.splitBar.secUnit')}
        offLabel={t('studio.splitBar.off')}
        lastGuardLabel={t('studio.splitBar.lastGuard')}
        onSegmentClick={roleId => {
          const first = task.lines.find(line => line.roleId === roleId && line.startMs !== undefined)
          if (first?.startMs !== undefined) play(first.startMs / 1000)
        }}
      />
      <div className="xmimo-studio-archive-player">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="xmimo-studio-archive-play-btn"
          onClick={() => { if (isPlaying) audioRef.current?.pause(); else play() }}
        >
          {isPlaying ? <RiPauseMiniFill size={16} aria-hidden="true" /> : <RiPlayMiniFill size={16} aria-hidden="true" />}
          <span>{t(isPlaying ? 'studio.tasks.pauseArchive' : 'studio.tasks.playArchive')}</span>
        </Button>
        <StudioSeekBar
          currentTime={currentTime}
          duration={duration}
          active={audioRef.current !== null}
          playing={isPlaying}
          chapters={chapters}
          ariaLabel={t('studio.tasks.seekArchive') + ' · ' + task.title}
          onSeek={seconds => {
            if (audioRef.current) seek(audioRef.current, seconds)
            else play(seconds)
          }}
          onScrubChange={setScrubbing}
        />
        <span className="xmimo-studio-archive-time">
          <strong className="xmimo-studio-archive-time-cur">{historyTime(displayedTime)}</strong>
          <span className="xmimo-studio-archive-time-sep">/</span>
          <span>{historyTime(duration)}</span>
        </span>
      </div>
      {playbackError ? <p className="xmimo-tts-failed" role="alert">{t('studio.error.audioPlayback')}</p> : null}
      <small className="xmimo-split-bar-desc">{t('studio.tasks.timelineHint')}</small>
      <ul ref={timelineRef} className="xmimo-studio-timeline">
        {task.lines.map((line, index) => (
          <li key={line.lineId + '-' + index}>
            <button
              type="button"
              className="xmimo-studio-timeline-item"
              data-current={lineIndex === index ? 'true' : undefined}
              aria-current={lineIndex === index ? 'true' : undefined}
              style={{ '--role-color': line.roleColor } as CSSProperties}
              disabled={line.startMs === undefined}
              onClick={() => { if (line.startMs !== undefined) play(line.startMs / 1000) }}
            >
              <span className="xmimo-studio-timeline-ts">{formatLineTime(line.startMs)}</span>
              <span className="xmimo-studio-timeline-role">{line.roleName}</span>
              <span className="xmimo-studio-timeline-text">{line.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
