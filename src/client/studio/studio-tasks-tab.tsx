import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  RiArrowDownSLine,
  RiCheckLine,
  RiClapperboardLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileCopyLine,
  RiFileList2Line,
  RiFolder3Line,
  RiHeadphoneLine,
  RiPauseMiniFill,
  RiPlayMiniFill,
  RiRefreshLine,
} from 'react-icons/ri'
import type { StudioTask, StudioTaskLineStatus, StudioTaskStatus } from '../../types/studio.js'
import { historyFileSize, historyTime } from '../history/history-list.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'
import { copyText } from '../settings/copy-text.js'
import { buildTaskProgressSegments } from '../settings/studio-module.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../shared.js'
import { SplitBar } from './split-bar.js'
import { StudioArchivePlayer } from './studio-archive-player.js'
import { studioClient, studioErrorMessage } from './studio-client-store.js'
import { StudioDeleteDialog } from './studio-delete-dialog.js'
import { studioWorkspaceStore } from './studio-workspace-store.js'

export interface StudioTasksTabProps {
  t: Translate
  tasks: readonly StudioTask[]
  storageBytes: number
  maxStorageBytes: number
  storageRoot?: string | undefined
  volume: number
  focusedTaskId?: string | undefined
  beforePlayback: () => boolean
  onGoScripts: () => void
  onDeleteError: (message: string) => void
}

const activeTaskStatuses = new Set<StudioTaskStatus>(['running', 'failed', 'paused', 'queued'])

const lineStatusLabels = {
  pending: 'studio.progress.pending',
  running: 'studio.progress.running',
  completed: 'studio.progress.completed',
  failed: 'studio.progress.failed',
} as const satisfies Record<StudioTaskLineStatus, string>

export function StudioTasksTab({
  t,
  tasks,
  storageBytes,
  maxStorageBytes,
  storageRoot,
  volume,
  focusedTaskId,
  beforePlayback,
  onGoScripts,
  onDeleteError,
}: StudioTasksTabProps): ReactElement {
  const [pendingDelete, setPendingDelete] = useState<StudioTask | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [pathCopied, setPathCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyTimerRef = useRef<number | undefined>(undefined)
  const pendingActions = useRef(new Set<string>())
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const focusTarget = useRef<HTMLElement>(null)
  const panelId = useId()
  const { active, history } = useMemo(() => ({
    active: tasks.filter(task => activeTaskStatuses.has(task.status))
      .sort((a, b) => b.createdAt - a.createdAt),
    history: tasks.filter(task => !activeTaskStatuses.has(task.status))
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)),
  }), [tasks])
  const [expandedId, setExpandedId] = useState<string | null>(
    () => active[0]?.id ?? studioWorkspaceStore.getSnapshot().playback.activeTaskId,
  )
  const locale = typeof document === 'undefined' ? undefined : document.documentElement?.lang || undefined
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }), [locale])
  const storagePercent = Math.min(100, Math.round((storageBytes / Math.max(1, maxStorageBytes)) * 100))

  useEffect(() => {
    if (focusedTaskId) focusTarget.current?.focus()
  }, [focusedTaskId])

  useEffect(() => () => {
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current)
  }, [])

  const controlTask = async (taskId: string, action: () => Promise<unknown>, onError?: (message: string) => void): Promise<boolean> => {
    if (pendingActions.current.has(taskId)) return false
    pendingActions.current.add(taskId)
    setBusyIds(new Set(pendingActions.current))
    setActionErrors(current => ({ ...current, [taskId]: '' }))
    try {
      await action()
      return true
    } catch (error) {
      const message = studioErrorMessage(error, t)
      if (onError) onError(message)
      else setActionErrors(current => ({ ...current, [taskId]: message }))
      return false
    } finally {
      pendingActions.current.delete(taskId)
      setBusyIds(new Set(pendingActions.current))
    }
  }

  const deleteTask = async (task: StudioTask): Promise<void> => {
    setPendingDelete(null)
    if (!await controlTask(task.id, () => studioClient.deleteTask(task.id), onDeleteError)) return
    setExpandedId(current => current === task.id ? null : current)
    if (studioWorkspaceStore.getSnapshot().playback.activeTaskId === task.id) {
      studioWorkspaceStore.setPlaybackBookmark(null, 0, true)
    }
  }

  const renderTask = (task: StudioTask): ReactElement => {
    const completed = task.status === 'completed'
    const isArchive = completed || task.status === 'canceled'
    const hasDetails = task.lines.length > 0 || completed
    const expanded = expandedId === task.id
    const busy = busyIds.has(task.id)
    const detailId = panelId + '-' + task.id
    const failedIndex = task.lines.findIndex(line => line.status === 'failed')
    const failed = task.status === 'failed' && failedIndex >= 0 ? task.lines[failedIndex] : undefined
    const timestamp = new Date(task.completedAt ?? task.createdAt)
    const badgeStyle = completed ? 'completed' : task.status === 'failed' ? 'failed' : task.status === 'paused' ? 'paused' : null
    return (
      <article
        key={task.id}
        ref={focusedTaskId === task.id ? focusTarget : undefined}
        tabIndex={focusedTaskId === task.id ? -1 : undefined}
        aria-label={task.title}
        className="xmimo-studio-card xmimo-studio-task"
      >
        <div className="xmimo-studio-task-header">
          <div className="xmimo-studio-task-heading">
            <span className={'xmimo-tts-studio-badge' + (badgeStyle ? ' xmimo-tts-studio-badge-' + badgeStyle : '')}>
              {t(`studio.tasks.status.${task.status}`)}
            </span>
            <strong>{task.title}</strong>
            <small className="xmimo-studio-task-meta">
              <time dateTime={timestamp.toISOString()}>{dateFormat.format(timestamp)}</time>
              {completed && task.durationMs !== undefined ? <span>{historyTime(task.durationMs / 1000)}</span> : null}
              {completed && task.audioSize ? <span>WAV · {historyFileSize(task.audioSize)}</span> : null}
            </small>
          </div>
          <div className="xmimo-studio-toolbar-group xmimo-studio-task-controls">
            {task.status === 'running' || task.status === 'queued' ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void controlTask(task.id, () => studioClient.taskAction('pause', task.id)) }}>
                <RiPauseMiniFill size={15} aria-hidden="true" />
                <span>{t('studio.tasks.pause')}</span>
              </Button>
            ) : null}
            {task.status === 'paused' || task.status === 'failed' ? (
              <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => { void controlTask(task.id, () => studioClient.taskAction('resume', task.id)) }}>
                <RiPlayMiniFill size={15} aria-hidden="true" />
                <span>{t('studio.tasks.resume')}</span>
              </Button>
            ) : null}
            {task.status === 'running' || task.status === 'queued' || task.status === 'paused' ? (
              <Button type="button" variant="ghost" size="sm" title={t('studio.tasks.cancel')} disabled={busy} onClick={() => { void controlTask(task.id, () => studioClient.taskAction('cancel', task.id)) }}>
                <RiCloseLine size={15} aria-hidden="true" />
              </Button>
            ) : null}
            {hasDetails ? (
              <button
                type="button"
                className={'xmimo-studio-task-details-toggle' + (completed ? ' xmimo-studio-task-details-toggle-archive' : '')}
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => setExpandedId(expanded ? null : task.id)}
              >
                {completed
                  ? <RiHeadphoneLine size={14} aria-hidden="true" />
                  : <RiFileList2Line size={14} aria-hidden="true" />}
                <span>
                  {t(completed
                    ? expanded ? 'studio.tasks.closeArchive' : 'studio.tasks.openArchive'
                    : expanded ? 'studio.tasks.hideLines' : 'studio.tasks.showLines')}
                </span>
                <RiArrowDownSLine size={15} className="xmimo-studio-task-details-chevron" aria-hidden="true" />
              </button>
            ) : null}
            {completed ? (
              <a className="xmimo-studio-download-link" href={studioClient.audioUrl(task.id, true)} download={task.title + '.wav'}>
                <RiDownloadLine size={14} aria-hidden="true" />
                <span>{t('studio.tasks.download')}</span>
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="xmimo-danger-action"
              title={t('studio.tasks.delete')}
              disabled={busy}
              onClick={() => setPendingDelete(task)}
            >
              <RiDeleteBinLine size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {actionErrors[task.id] ? <p className="xmimo-tts-failed" role="alert">{actionErrors[task.id]}</p> : null}

        {!isArchive ? (
          <SplitBar
            segments={buildTaskProgressSegments(task, t)}
            title={t('studio.progress.title')}
            totalLabel={t('studio.splitBar.total')}
            totalOverride={task.completedLines + ' / ' + task.totalLines}
            unit={t('studio.splitBar.linesUnit')}
            offLabel={t('studio.splitBar.off')}
            lastGuardLabel={t('studio.splitBar.lastGuard')}
          />
        ) : null}

        {failed ? (
          <div className="xmimo-studio-task-failure">
            <div>
              <strong>{t('studio.tasks.failureLine').replace('{line}', String(failedIndex + 1)).replace('{role}', failed.roleName)}</strong>
              <p>{failed.text}</p>
              <small>{studioErrorMessage(failed.errorCode ?? task.errorCode, t)}</small>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void controlTask(task.id, () => studioClient.taskAction('retry-line', task.id, failedIndex)) }}>
              <RiRefreshLine size={14} aria-hidden="true" />
              <span>{t('studio.tasks.retryLine')}</span>
            </Button>
          </div>
        ) : task.status === 'failed' && task.errorCode ? (
          <p className="xmimo-tts-failed" role="status">{studioErrorMessage(task.errorCode, t)}</p>
        ) : null}

        {hasDetails ? (
          <div className="xmimo-studio-task-details" id={detailId} hidden={!expanded}>
            {expanded && (completed
              ? <StudioArchivePlayer t={t} task={task} volume={volume} beforePlayback={beforePlayback} />
              : <ul className="xmimo-studio-timeline">
                {task.lines.map((line, index) => (
                  <li key={line.lineId + '-' + index} className="xmimo-studio-timeline-item"
                    style={{ '--role-color': line.roleColor } as CSSProperties}>
                    <span className="xmimo-studio-timeline-ts">#{index + 1}</span>
                    <span className="xmimo-studio-timeline-role">{line.roleName}</span>
                    <span className="xmimo-studio-timeline-text">{line.text}</span>
                    <span className="xmimo-studio-timeline-ts">{t(lineStatusLabels[line.status])}</span>
                  </li>
                ))}
              </ul>)}
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <div className="xmimo-studio-panel">
      <div className="xmimo-studio-storage-bar">
        {storageRoot ? (
          <div className="xmimo-studio-storage-path">
            <RiFolder3Line size={13} className="xmimo-studio-storage-icon" aria-hidden="true" />
            <code className="xmimo-studio-storage-code" title={storageRoot}>{storageRoot}</code>
            <button
              type="button"
              className="xmimo-studio-storage-copy"
              data-copied={pathCopied === 'copied' ? 'true' : undefined}
              title={t(pathCopied === 'copied' ? 'studio.tasks.storageDirCopied' : 'studio.tasks.copyStorageDir')}
              aria-label={t(pathCopied === 'copied' ? 'studio.tasks.storageDirCopied' : 'studio.tasks.copyStorageDir')}
              onClick={() => {
                void copyText(storageRoot).then(ok => {
                  setPathCopied(ok ? 'copied' : 'failed')
                  if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current)
                  copyTimerRef.current = window.setTimeout(() => setPathCopied('idle'), 1800)
                })
              }}
            >
              {pathCopied === 'copied'
                ? <RiCheckLine size={13} aria-hidden="true" />
                : <RiFileCopyLine size={13} aria-hidden="true" />}
            </button>
          </div>
        ) : null}
        <small className="xmimo-studio-storage" title={t('studio.tasks.storageUsage')}>
          {historyFileSize(storageBytes)} / {historyFileSize(maxStorageBytes)} ({storagePercent}%)
        </small>
      </div>
      {tasks.length === 0 ? (
        <div className="xmimo-studio-empty-page">
          <img src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={136} height={136} alt="" aria-hidden="true" />
          <p>{t('studio.tasks.empty')}</p>
          <Button type="button" variant="primary" size="sm" onClick={onGoScripts}>
            <RiClapperboardLine size={14} aria-hidden="true" />
            <span>{t('studio.tasks.goScripts')}</span>
          </Button>
        </div>
      ) : null}
      {active.length > 0 ? (
        <section className="xmimo-studio-task-group" aria-label={t('studio.tasks.active')}>
          {active.map(renderTask)}
        </section>
      ) : null}
      {history.length > 0 ? (
        <section className="xmimo-studio-task-group" aria-label={t('studio.tasks.archive')}>
          {history.map(renderTask)}
        </section>
      ) : null}
      {pendingDelete ? (
        <StudioDeleteDialog
          t={t}
          title={t('studio.tasks.deleteTitle')}
          name={pendingDelete.title}
          description={t('studio.tasks.deleteDescription')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { void deleteTask(pendingDelete) }}
        />
      ) : null}
    </div>
  )
}
