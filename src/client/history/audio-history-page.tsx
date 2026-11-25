import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { RiArrowLeftSLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiDownloadLine, RiSearchLine } from 'react-icons/ri'
import { Button, IconRefreshOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AudioHistory, AudioHistoryEntry } from './audio-history.js'
import type { Translate } from '../localization.js'
import { filterAudioHistory, HistoryDownloads, historyFileSize, historyTime } from './history-list.js'
import type { HistorySource } from './history-list.js'
import { HistoryReplay } from './history-replay.js'
import type { HistoryReplayView } from './history-replay.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../shared.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { isSpeechBusy } from '../announcements/speech-activity.js'
import { hostRoute } from '../host-route.js'
import { PlaybackIcon } from '../playback/playback-icon.js'
import { VoiceReadingSelect } from '../settings/voice-reading-select.js'
import { PanelStatusView } from '../lazy-panel.js'
import { HISTORY_CLIENT_STYLES } from '../style/history-styles.js'
import { useClientStyle } from '../style/inject.js'
import { useWarningToast } from '../use-warning-toast.js'

export interface AudioHistoryPageProps {
  history: AudioHistory
  t: Translate
  volume: number
  voiceRate: number
  minimalMode: boolean
  speechActivity?: SpeechActivity | undefined
  beforePlayback: () => boolean | void
  onBack: () => void
}

interface HistoryRowProps {
  entry: AudioHistoryEntry
  t: Translate
  activePlayback: HistoryReplayView | null
  expanded: boolean
  deleting: boolean
  pending: boolean
  onTogglePlay: (entry: AudioHistoryEntry) => void
  onSeek: (time: number) => void
  onToggleExpand: (id: string) => void
  onDownload: (entry: AudioHistoryEntry) => void
  onDeleteBlur: (id: string) => void
  onDeleteEscape: () => void
  onDeleteClick: (id: string) => void
}

const HistoryRow = memo(function HistoryRow({
  entry, t, activePlayback, expanded, deleting, pending,
  onTogglePlay, onSeek, onToggleExpand, onDownload, onDeleteBlur, onDeleteEscape, onDeleteClick,
}: HistoryRowProps): ReactElement {
  const label = entry.text.trim() || t('history.untitled')
  const shortLabel = label.slice(0, 60)
  const charCount = useMemo(() => Array.from(label).length, [label])
  const created = useMemo(() => {
    const date = new Date(entry.createdAt)
    return { iso: date.toISOString(), local: date.toLocaleString() }
  }, [entry.createdAt])
  const selected = activePlayback !== null
  const busy = selected && (activePlayback.status === 'loading' || activePlayback.status === 'playing')
  const playbackLabel = selected
    ? t(busy ? 'history.pause' : activePlayback.status === 'error' ? 'history.retry' : 'history.play')
    : t('history.listen')
  const durationLabel = selected && activePlayback.duration > 0 ? historyTime(activePlayback.duration) : '--:--'
  const progressStyle = selected
    ? { '--xmimo-history-progress': `${activePlayback.duration > 0 ? Math.min(100, Math.max(0, activePlayback.currentTime / activePlayback.duration * 100)) : 0}%` } as CSSProperties
    : undefined

  return <li className={`xmimo-tts-history-row${selected ? ' xmimo-tts-history-row-selected' : ''}`} data-playing={busy ? 'true' : undefined}>
    <Button type="button" variant="primary" size="sm" className="xmimo-tts-history-player-toggle" title={playbackLabel} aria-label={`${playbackLabel}: ${shortLabel}`} onClick={() => onTogglePlay(entry)}>
      {selected && activePlayback.status === 'error' ? <IconRefreshOutlineMedium size={16} aria-hidden="true" /> : <PlaybackIcon state={!selected || !busy ? 'play' : 'pause'} />}
    </Button>
    <div className="xmimo-tts-history-copy">
      <button type="button" className="xmimo-tts-history-text-toggle" aria-expanded={expanded} aria-label={`${t('history.expand')}: ${shortLabel}`} onClick={() => onToggleExpand(entry.id)}>
        <span className={`xmimo-tts-history-text${expanded ? ' xmimo-tts-history-text-expanded' : ''}`}>{label}</span>
      </button>
      <div className="xmimo-tts-history-meta">
        <span className="xmimo-tts-history-source-tag">{t(`history.${entry.source}`)}</span>
        <span className="xmimo-tts-history-meta-item">{charCount} {t('history.characters')}</span>
        <time className="xmimo-tts-history-meta-item" dateTime={created.iso}>{created.local}</time>
        <span className="xmimo-tts-history-meta-item xmimo-tts-history-meta-format">{entry.format.toUpperCase()} · {historyFileSize(entry.blob.size)}</span>
      </div>
      {selected ? <div className="xmimo-tts-history-player" aria-label={t('history.player')}>
        <div className="xmimo-tts-history-player-controls">
          <input type="range" style={progressStyle} min={0} max={activePlayback.duration || 1} step={0.1} value={Math.min(activePlayback.currentTime, activePlayback.duration || 1)} disabled={activePlayback.duration <= 0 || activePlayback.status === 'error'} aria-label={t('history.seek')} aria-valuetext={`${historyTime(activePlayback.currentTime)} / ${durationLabel}`} onChange={(event) => { onSeek(Number(event.target.value)) }} />
          <span className="xmimo-tts-history-time">{historyTime(activePlayback.currentTime)} / {durationLabel}</span>
        </div>
        <span className={activePlayback.status === 'error' ? 'xmimo-tts-history-player-error xmimo-tts-failed' : 'xmimo-tts-history-player-status'} role="status">{t(activePlayback.status === 'error' ? `history.error.${activePlayback.error ?? 'failed'}` : `history.state.${activePlayback.status}`)}</span>
      </div> : null}
    </div>
    <div className="xmimo-tts-history-actions">
      <Button type="button" variant="outline" size="sm" className="xmimo-tts-history-action" title={t('history.download')} aria-label={`${t('history.download')}: ${shortLabel}`} onClick={() => onDownload(entry)}><RiDownloadLine aria-hidden="true" /><span>{t('history.download')}</span></Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} className="xmimo-tts-history-action xmimo-danger-action"
        data-confirm={deleting ? 'true' : undefined}
        title={t(deleting ? 'history.confirmDelete' : 'history.delete')}
        aria-label={`${t(deleting ? 'history.confirmDelete' : 'history.delete')}: ${shortLabel}`}
        onBlur={() => onDeleteBlur(entry.id)}
        onKeyDown={(event) => { if (event.key === 'Escape') onDeleteEscape() }}
        onClick={() => onDeleteClick(entry.id)}>{deleting ? <RiCheckLine aria-hidden="true" /> : <RiDeleteBinLine aria-hidden="true" />}<span>{t(deleting ? 'history.confirmDelete' : 'history.delete')}</span></Button>
    </div>
  </li>
})

export function AudioHistoryPage({ history, t, volume, voiceRate, minimalMode, speechActivity, beforePlayback, onBack }: AudioHistoryPageProps): ReactElement {
  const view = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const [replay] = useState(() => new HistoryReplay(history, beforePlayback))
  useEffect(() => speechActivity?.register(() => isSpeechBusy(replay.getSnapshot().status), () => replay.stop()), [speechActivity, replay])
  const playback = useSyncExternalStore(replay.subscribe, replay.getSnapshot)
  const [downloads] = useState(() => new HistoryDownloads())
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<HistorySource>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [pending, setPending] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [showDeleteError, deleteErrorToast] = useWarningToast()
  const backRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLElement>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const deletingRef = useRef(deleting)
  deletingRef.current = deleting
  useClientStyle('history', HISTORY_CLIENT_STYLES)
  useEffect(() => {
    void history.ensureLoaded()
    replay.activate()
    backRef.current?.focus({ preventScroll: true })
    return () => { replay.deactivate(); downloads.dispose() }
  }, [history, replay, downloads])
  useEffect(() => { replay.configure(volume, voiceRate, beforePlayback) }, [replay, volume, voiceRate, beforePlayback])
  useEffect(() => {
    const page = pageRef.current
    if (!page || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width <= 520) setQuery('')
    })
    observer.observe(page)
    return () => { observer.disconnect() }
  }, [])
  const hasEntries = view.entries.length > 0
  const entries = useMemo(() => filterAudioHistory(view.entries, query, source), [view.entries, query, source])
  const totalBytes = useMemo(() => view.entries.reduce((sum, entry) => sum + entry.blob.size, 0), [view.entries])
  const mutate = useCallback(async (id?: string): Promise<void> => {
    setPending(true)
    setDownloadError(false)
    try {
      if (id === undefined) await history.clear()
      else await history.remove(id)
      setDeleting(null)
      setClearing(false)
      const focusTarget = searchRef.current?.getClientRects().length ? searchRef.current : backRef.current
      focusTarget?.focus({ preventScroll: true })
    } catch { showDeleteError(t('history.actionFailed')) }
    finally { setPending(false) }
  }, [history, showDeleteError, t])
  const download = useCallback((entry: AudioHistoryEntry): void => {
    setDownloadError(false)
    try { downloads.download(entry) } catch { setDownloadError(true) }
  }, [downloads])
  const togglePlay = useCallback((entry: AudioHistoryEntry): void => {
    const current = replay.getSnapshot()
    const isBusy = current.status === 'loading' || current.status === 'playing'
    if (entry.id === current.entryId && isBusy) replay.pause()
    else void replay.play(entry)
  }, [replay])
  const seek = useCallback((time: number): void => { replay.seek(time) }, [replay])
  const toggleExpand = useCallback((id: string): void => { setExpanded(current => current === id ? null : id) }, [])
  const handleDeleteBlur = useCallback((id: string): void => {
    if (!pendingRef.current) setDeleting(current => current === id ? null : current)
  }, [])
  const handleDeleteEscape = useCallback((): void => { setDeleting(null) }, [])
  const handleDeleteClick = useCallback((id: string): void => {
    if (deletingRef.current === id) void mutate(id)
    else { setDeleting(id); setClearing(false) }
  }, [mutate])
  return <section ref={pageRef} tabIndex={-1} className={minimalMode ? 'xmimo-ui-scope xmimo-tts-history-page xmimo-tts-history-page-minimal' : 'xmimo-ui-scope xmimo-tts-history-page'} aria-label={t('history.title')}>
    <header className="xmimo-tts-history-header">
      <h2 aria-label={t('history.title')}>
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="xmimo-tts-history-title-back"
          aria-label={t('history.backToSettings')} title={t('history.backToSettings')} onClick={onBack}>
          <RiArrowLeftSLine size={18} aria-hidden="true" focusable="false" />
          <span>{t('history.title')}</span>
        </Button>
        <span className="xmimo-tts-history-count">{view.entries.length}</span>
      </h2>
      {hasEntries ? <div className="xmimo-tts-history-toolbar">
        <div className="xmimo-tts-history-search">
          <RiSearchLine size={15} aria-hidden="true" />
          <input ref={searchRef} type="search" aria-label={t('history.search')} placeholder={t('history.search')} value={query} onChange={(event) => { setQuery(event.target.value); setDeleting(null) }} />
          {query ? <button type="button" className="xmimo-tts-history-search-clear" aria-label={t('history.resetFilters')} onClick={() => { setQuery(''); setDeleting(null); searchRef.current?.focus({ preventScroll: true }) }}><RiCloseLine size={15} aria-hidden="true" /></button> : null}
        </div>
        <div className="xmimo-tts-history-source">
          <VoiceReadingSelect label={t('history.source')} value={source} disabled={pending} buttonVariant="outline"
            options={(['all', 'conversation', 'preview', 'service'] as const).map(id => ({ id, label: t(`history.${id}`) }))}
            onSelect={(id) => { setSource(id as HistorySource); setDeleting(null) }} />
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending || view.status === 'loading'} className="xmimo-tts-history-action xmimo-danger-action"
          data-confirm={clearing ? 'true' : undefined}
          aria-label={t(clearing ? 'history.confirmClear' : 'history.clear')}
          title={t(clearing ? 'history.clearConfirm' : 'history.clear')}
          onBlur={() => { if (!pending) setClearing(false) }}
          onKeyDown={(event) => { if (event.key === 'Escape') setClearing(false) }}
          onClick={() => {
            if (clearing) void mutate()
            else { setClearing(true); setDeleting(null) }
          }}>{clearing ? <RiCheckLine aria-hidden="true" /> : <RiDeleteBinLine aria-hidden="true" />}<span>{t(clearing ? 'history.confirmClear' : 'history.clear')}</span></Button>
      </div> : null}
    </header>
    {view.status === 'memory' ? <p className="xmimo-tts-history-warning" role="status">{t('history.memory')}</p> : null}
    {view.skipped ? <p className="xmimo-tts-history-warning" role="status">{t('history.skipped')}</p> : null}
    {downloadError ? <p className="xmimo-tts-history-error xmimo-tts-failed" role="alert">{t('history.actionFailed')}</p> : null}
    {deleteErrorToast}
    <div className="xmimo-tts-history-results">
      {view.status === 'loading' ? <PanelStatusView message={t('history.loading')} compact />
        : view.entries.length === 0 ? <div className="xmimo-tts-history-empty" role="status">
          {!minimalMode ? <div className="xmimo-tts-history-empty-visual" aria-hidden="true">
            <img className="xmimo-tts-history-empty-whale" src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={144} height={144} alt="" />
          </div> : null}
          <p>{t('history.empty')}</p>
        </div>
          : entries.length === 0 ? <div className="xmimo-tts-history-empty xmimo-tts-history-no-results" role="status"><p>{t('history.noResults')}</p><Button type="button" variant="outline" size="sm" className="xmimo-tts-history-reset" onClick={() => { setQuery(''); setSource('all') }}>{t('history.resetFilters')}</Button></div>
            : <ul className="xmimo-tts-history-list">
              {entries.map((entry) => <HistoryRow
                key={entry.id}
                entry={entry}
                t={t}
                activePlayback={entry.id === playback.entryId ? playback : null}
                expanded={expanded === entry.id}
                deleting={deleting === entry.id}
                pending={pending}
                onTogglePlay={togglePlay}
                onSeek={seek}
                onToggleExpand={toggleExpand}
                onDownload={download}
                onDeleteBlur={handleDeleteBlur}
                onDeleteEscape={handleDeleteEscape}
                onDeleteClick={handleDeleteClick}
              />)}
            </ul>}
    </div>
    <footer className="xmimo-tts-history-footer">
      {hasEntries ? <div className="xmimo-tts-history-storage">
        <span className="xmimo-tts-history-storage-summary">{t(view.status === 'memory' ? 'history.temporary' : 'history.savedHere')} · {view.entries.length} · {historyFileSize(totalBytes)}</span>
        <span className="xmimo-tts-history-limit">{t('history.hint')}</span>
      </div> : null}
      <Button type="button" variant="outline" size="sm" className="xmimo-tts-history-back" onClick={onBack}>
        <RiArrowLeftSLine size={16} aria-hidden="true" focusable="false" />
        {t('history.backToSettings')}
      </Button>
    </footer>
  </section>
}
