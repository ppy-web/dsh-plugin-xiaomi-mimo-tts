import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiClapperboardLine, RiExternalLinkLine, RiPauseMiniFill, RiPlayMiniFill, RiStopMiniFill } from 'react-icons/ri'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../shared.js'
import type { StudioTask } from '../../types/studio.js'
import { hostRoute } from '../host-route.js'
import { historyFileSize, historyTime } from '../history/history-list.js'
import type { Translate } from '../localization.js'
import { CollapsibleModule } from './collapsible-module.js'
import { TactileButton } from './controls/tactile-button.js'
import { SplitBar } from '../studio/split-bar.js'
import type { SplitSegment } from '../studio/split-bar.js'
import { studioClient, studioErrorMessage, useStudioState } from '../studio/studio-client-store.js'

const RECENT_ARCHIVE_COUNT = 6
const ARCHIVE_CARD_MAX_ROLES = 3

interface ArchiveCastItem {
  id: string
  name: string
  color: string
}

function summarizeArchiveCast(task: StudioTask): ArchiveCastItem[] {
  const seen = new Map<string, ArchiveCastItem>()
  for (const line of task.lines) {
    if (!seen.has(line.roleId)) {
      seen.set(line.roleId, { id: line.roleId, name: line.roleName, color: line.roleColor })
    }
  }
  return [...seen.values()]
}

export interface StudioModuleProps {
  t: Translate
  open: boolean
  volume: number
  onToggleOpen: () => void
  onOpenStudio: (tab?: 'scripts' | 'roles' | 'tasks') => void
  onPreloadStudio?: () => void
  beforePlayback?: () => boolean
}

export function buildTaskProgressSegments(task: StudioTask, t: Translate): SplitSegment[] {
  let completed = 0
  let running = 0
  let pending = 0
  let failed = 0
  for (const line of task.lines) {
    if (line.status === 'completed') completed += 1
    else if (line.status === 'running') running += 1
    else if (line.status === 'failed') failed += 1
    else pending += 1
  }
  const segments: SplitSegment[] = []
  if (completed > 0) segments.push({ id: 'completed', label: t('studio.progress.completed'), value: completed, color: '#10b981' })
  if (running > 0) segments.push({ id: 'running', label: t('studio.progress.running'), value: running, color: '#3b82f6' })
  if (failed > 0) segments.push({ id: 'failed', label: t('studio.progress.failed'), value: failed, color: '#ef4444' })
  if (pending > 0) segments.push({ id: 'pending', label: t('studio.progress.pending'), value: pending, color: '#94a3b8' })
  return segments
}

export function StudioModule({
  t,
  open,
  volume,
  onToggleOpen,
  onOpenStudio,
  onPreloadStudio,
  beforePlayback,
}: StudioModuleProps): ReactElement {
  const studio = useStudioState()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingTaskId, setPlayingTaskId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const activeTask = useMemo(
    () => studio.tasks.find(task => task.status === 'running' || task.status === 'queued' || task.status === 'failed' || task.status === 'paused') ?? null,
    [studio.tasks],
  )
  const { completedCount, recentArchives } = useMemo(() => {
    const completed = studio.tasks.filter(task => task.status === 'completed')
    completed.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))
    return { completedCount: completed.length, recentArchives: completed.slice(0, RECENT_ARCHIVE_COUNT) }
  }, [studio.tasks])

  const releaseAudio = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    audioRef.current = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  useEffect(() => releaseAudio, [releaseAudio])

  useEffect(() => {
    if (open) return
    releaseAudio()
    setPlayingTaskId(null)
  }, [open, releaseAudio])

  useEffect(() => {
    if (!playingTaskId || recentArchives.some(task => task.id === playingTaskId)) return
    releaseAudio()
    setPlayingTaskId(null)
  }, [playingTaskId, recentArchives, releaseAudio])

  const toggleQuickPlay = (task: StudioTask): void => {
    if (playingTaskId === task.id) {
      releaseAudio()
      setPlayingTaskId(null)
      return
    }
    if (beforePlayback && !beforePlayback()) return
    releaseAudio()
    setActionError(null)
    const player = new Audio()
    audioRef.current = player
    const finish = (failed: boolean): void => {
      if (audioRef.current !== player) return
      releaseAudio()
      setPlayingTaskId(null)
      if (failed) setActionError(t('studio.error.audioPlayback'))
    }
    player.addEventListener('ended', () => finish(false), { once: true })
    player.addEventListener('error', () => finish(true), { once: true })
    player.volume = Math.min(1, Math.max(0, volume))
    player.src = studioClient.audioUrl(task.id)
    setPlayingTaskId(task.id)
    void player.play().catch(() => finish(true))
  }

  const locale = typeof document === 'undefined' ? undefined : document.documentElement?.lang || undefined
  const archiveDateFormat = useMemo(() => new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }), [locale])

  const progressSegments = useMemo(
    () => (activeTask ? buildTaskProgressSegments(activeTask, t) : []),
    [activeTask, t],
  )

  const hasTasksOrArchives = activeTask !== null || recentArchives.length > 0
  const controlTask = (action: 'pause' | 'resume', taskId: string): void => {
    setActionError(null)
    void studioClient.taskAction(action, taskId).catch(error => setActionError(studioErrorMessage(error, t)))
  }

  return (
    <CollapsibleModule
      className="xmimo-tts-settings-module xmimo-tts-studio-module"
      title={
        <span className="xmimo-ui-module-title">
          <RiClapperboardLine size={14} aria-hidden="true" focusable="false" />
          <span>{t('studio.title')}</span>
          <span className="xmimo-ui-module-subtitle">{t('studio.cardSubtitle')}</span>
        </span>
      }
      ariaLabel={t('studio.title')}
      searchGroups={['studio']}
      open={open}
      onToggle={onToggleOpen}
      interactiveSummary
      summary={
        <span className="xmimo-ui-summary">
          <TactileButton
            className="xmimo-tts-studio-enter-tag"
            title={t('studio.enter')}
            aria-label={t('studio.enter')}
            onPointerEnter={onPreloadStudio}
            onFocus={onPreloadStudio}
            onClick={(event) => {
              event.stopPropagation()
              onOpenStudio('scripts')
            }}
          >
            <RiExternalLinkLine size={12} aria-hidden="true" />
            <span>{t('studio.enter')}</span>
          </TactileButton>
          {activeTask ? (
            <span>
              {activeTask.status === 'running' ? t('studio.summary.recording')
                : activeTask.status === 'queued' ? t('studio.summary.queued')
                : activeTask.status === 'failed' ? t('studio.summary.failed')
                : t('studio.summary.paused')} · {activeTask.completedLines}/{activeTask.totalLines}
            </span>
          ) : null}
          {studio.scripts.length > 0 ? <span>{studio.scripts.length} {t('studio.summary.scriptsCount')}</span> : <span>{t('studio.summary.empty')}</span>}
          {studio.roles.length > 0 ? <span>{studio.roles.length} {t('studio.summary.rolesCount')}</span> : null}
          {completedCount > 0 ? <span>{completedCount} {t('studio.summary.completedCount')}</span> : null}
        </span>
      }
    >
      <div className="xmimo-tts-studio-card-body">
        {actionError ? <p className="xmimo-tts-failed" role="alert">{actionError}</p> : null}
        {!hasTasksOrArchives ? (
          <div className="xmimo-tts-studio-empty" role="status">
            <img
              className="xmimo-tts-studio-empty-whale"
              src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)}
              width={96}
              height={96}
              alt=""
              aria-hidden="true"
            />
            <strong>{t('studio.card.emptyTitle')}</strong>
            <p>{t('studio.card.emptyHint')}</p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onPointerEnter={onPreloadStudio}
              onClick={() => onOpenStudio('scripts')}
            >
              <RiClapperboardLine size={14} aria-hidden="true" />
              <span>{t('studio.enter')}</span>
            </Button>
          </div>
        ) : (
          <>
            {activeTask ? (
              <div className="xmimo-tts-studio-task-strip">
                <div className="xmimo-tts-studio-strip-row">
                  <div className="xmimo-tts-studio-strip-meta">
                    <span className={`xmimo-tts-studio-badge${activeTask.status === 'paused' ? ' xmimo-tts-studio-badge-paused' : activeTask.status === 'failed' ? ' xmimo-tts-studio-badge-failed' : ''}`}>
                      {t(`studio.tasks.status.${activeTask.status}`)}
                    </span>
                    <strong>{activeTask.title}</strong>
                  </div>
                  <div className="xmimo-tts-studio-card-actions">
                    {activeTask.status === 'running' || activeTask.status === 'queued' ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => controlTask('pause', activeTask.id)}>
                        <RiPauseMiniFill size={15} aria-hidden="true" />
                        <span>{t('studio.tasks.pause')}</span>
                      </Button>
                    ) : (
                      <Button type="button" variant="primary" size="sm" onClick={() => controlTask('resume', activeTask.id)}>
                        <RiPlayMiniFill size={15} aria-hidden="true" />
                        <span>{t('studio.tasks.resume')}</span>
                      </Button>
                    )}
                  </div>
                </div>
                <SplitBar
                  compact
                  segments={progressSegments}
                  title={t('studio.progress.title')}
                  totalLabel={t('studio.splitBar.total')}
                  totalOverride={`${activeTask.completedLines} / ${activeTask.totalLines}`}
                  unit={t('studio.splitBar.linesUnit')}
                  offLabel={t('studio.splitBar.off')}
                  lastGuardLabel={t('studio.splitBar.lastGuard')}
                  onSegmentClick={() => onOpenStudio('tasks')}
                />
              </div>
            ) : null}

            {recentArchives.length > 0 ? (
              <section className="xmimo-tts-studio-archive-strip" aria-label={t('studio.card.recentArchives')}>
                <ul className="xmimo-tts-studio-archive-list">
                  {recentArchives.map((archive, index) => {
                    const playing = playingTaskId === archive.id
                    const label = t(playing ? 'studio.card.quickStop' : 'studio.card.quickPlay').replace('{title}', archive.title)
                    const cast = summarizeArchiveCast(archive)
                    const visibleCast = cast.slice(0, ARCHIVE_CARD_MAX_ROLES)
                    const extraCast = cast.length - visibleCast.length
                    const lineCount = archive.totalLines || archive.lines.length
                    const finishedAt = archive.completedAt ?? archive.updatedAt ?? archive.createdAt
                    return (
                      <li key={archive.id} className="xmimo-tts-studio-archive-card" data-playing={playing ? 'true' : undefined}>
                        <div className="xmimo-tts-studio-archive-card-head">
                          <div className="xmimo-tts-studio-archive-title-row">
                            <strong title={archive.title}>{archive.title}</strong>
                            {index === 0 ? <span className="xmimo-tts-studio-new-tag">NEW</span> : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="xmimo-tts-studio-archive-play"
                            data-playing={playing ? 'true' : undefined}
                            aria-label={label}
                            title={label}
                            onClick={() => toggleQuickPlay(archive)}
                          >
                            {playing ? <RiStopMiniFill size={16} aria-hidden="true" /> : <RiPlayMiniFill size={16} aria-hidden="true" />}
                          </Button>
                        </div>
                        {visibleCast.length > 0 ? (
                          <div className="xmimo-tts-studio-archive-cast" aria-label={visibleCast.map(item => item.name).join(' / ')}>
                            {visibleCast.map(member => (
                              <span key={member.id} className="xmimo-tts-studio-archive-role" title={member.name}>
                                <span
                                  className="xmimo-tts-studio-archive-role-dot"
                                  style={{ '--role-color': member.color } as CSSProperties}
                                  aria-hidden="true"
                                />
                                <span>{member.name}</span>
                              </span>
                            ))}
                            {extraCast > 0 ? <span className="xmimo-tts-studio-archive-role-more">+{extraCast}</span> : null}
                          </div>
                        ) : null}
                        <div className="xmimo-tts-studio-archive-meta">
                          {archive.durationMs !== undefined ? (
                            <span className="xmimo-tts-studio-archive-duration">{historyTime(archive.durationMs / 1000)}</span>
                          ) : null}
                          {lineCount > 0 ? <span>{lineCount} {t('studio.splitBar.linesUnit')}</span> : null}
                          {archive.audioSize ? <span>{historyFileSize(archive.audioSize)}</span> : null}
                          {finishedAt ? <time dateTime={new Date(finishedAt).toISOString()}>{archiveDateFormat.format(new Date(finishedAt))}</time> : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </CollapsibleModule>
  )
}
