import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button, Input, IconRefreshOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AudioHistory, AudioHistoryEntry } from './audio-history.js'
import type { Translate } from '../localization.js'
import { filterAudioHistory, HistoryDownloads, historyFileSize, historyTime } from './history-list.js'
import type { HistorySource } from './history-list.js'
import { HistoryReplay } from './history-replay.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import { hostRoute } from '../host-route.js'

export interface AudioHistoryPageProps {
  history: AudioHistory
  t: Translate
  volume: number
  voiceRate: number
  minimalMode: boolean
  beforePlayback: () => void
  onBack: () => void
}

export function AudioHistoryPage({ history, t, volume, voiceRate, minimalMode, beforePlayback, onBack }: AudioHistoryPageProps): ReactElement {
  const view = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const [replay] = useState(() => new HistoryReplay(history, beforePlayback))
  const playback = useSyncExternalStore(replay.subscribe, replay.getSnapshot)
  const [downloads] = useState(() => new HistoryDownloads())
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<HistorySource>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    replay.activate()
    backRef.current?.focus({ preventScroll: true })
    return () => { replay.dispose(); downloads.dispose() }
  }, [replay, downloads])
  useEffect(() => { replay.configure(volume, voiceRate, beforePlayback) }, [replay, volume, voiceRate, beforePlayback])
  const hasEntries = view.entries.length > 0
  const entries = filterAudioHistory(view.entries, query, source)
  const selected = view.entries.find((entry) => entry.id === playback.entryId)
  const busy = playback.status === 'loading' || playback.status === 'playing'
  const playbackLabel = t(busy ? 'history.pause' : playback.status === 'error' ? 'history.retry' : 'history.play')
  const durationLabel = playback.duration > 0 ? historyTime(playback.duration) : '--:--'
  const progressStyle = { '--xmimo-history-progress': `${playback.duration > 0 ? Math.min(100, Math.max(0, playback.currentTime / playback.duration * 100)) : 0}%` } as CSSProperties
  const title = (entry: AudioHistoryEntry): string => entry.text.trim() || t('history.untitled')
  const mutate = async (id?: string): Promise<void> => {
    setPending(true)
    setActionError(false)
    try {
      if (id === undefined) await history.clear()
      else await history.remove(id)
      setDeleting(null)
      setClearing(false)
      const focusTarget = searchRef.current ?? backRef.current
      focusTarget?.focus({ preventScroll: true })
    } catch { setActionError(true) }
    finally { setPending(false) }
  }
  const download = (entry: AudioHistoryEntry): void => {
    setActionError(false)
    try { downloads.download(entry) } catch { setActionError(true) }
  }
  return <section className="xmimo-ui-scope xmimo-tts-history-page" aria-label={t('history.title')}>
    <header className="xmimo-tts-history-header">
      <h2>{t('history.title')} <span className="xmimo-tts-history-count">· {view.entries.length}</span></h2>
      <Button ref={backRef} type="button" onClick={onBack}>{t('history.back')}</Button>
    </header>
    {hasEntries ? <><div className="xmimo-tts-history-toolbar">
      <Input ref={searchRef} type="search" className="xmimo-tts-history-search" aria-label={t('history.search')} placeholder={t('history.search')} value={query} onChange={(event) => { setQuery(event.target.value); setDeleting(null) }} />
      <label className="xmimo-tts-history-source">{t('history.source')}
        <select value={source} onChange={(event) => { setSource(event.target.value as HistorySource); setDeleting(null) }}>
          {(['all', 'conversation', 'preview', 'service'] as const).map((value) => <option key={value} value={value}>{t(`history.${value}`)}</option>)}
        </select>
      </label>
      <Button type="button" disabled={view.entries.length === 0 || pending || view.status === 'loading'} onClick={() => { setClearing(true); setDeleting(null) }}>{t('history.clear')}</Button>
    </div>
    {clearing ? <div className="xmimo-tts-history-confirm" role="group" aria-label={t('history.clearConfirm')}>
      <span>{t('history.clearConfirm')} ({view.entries.length})</span>
      <Button type="button" disabled={pending} onClick={() => { void mutate() }}>{t('history.confirmClear')}</Button>
      <Button type="button" disabled={pending} onClick={() => { setClearing(false) }}>{t('history.cancel')}</Button>
    </div> : null}
    <div className="xmimo-tts-history-storage">
      <span>{t(view.status === 'memory' ? 'history.temporary' : 'history.savedHere')} · {view.entries.length} · {historyFileSize(view.entries.reduce((sum, entry) => sum + entry.blob.size, 0))}</span>
      <span>{t('history.hint')}</span>
    </div>
    </> : null}
    {view.status === 'memory' ? <p className="xmimo-tts-history-warning" role="status">{t('history.memory')}</p> : null}
    {view.skipped ? <p className="xmimo-tts-history-warning" role="status">{t('history.skipped')}</p> : null}
    {actionError ? <p className="xmimo-tts-failed" role="alert">{t('history.actionFailed')}</p> : null}
    <div className="xmimo-tts-history-results">
      {view.status === 'loading' ? <p className="xmimo-tts-history-empty" role="status">{t('history.loading')}</p>
        : view.entries.length === 0 ? <div className="xmimo-tts-history-empty" role="status">
          {!minimalMode ? <img className="xmimo-tts-history-empty-whale" src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={144} height={144} alt="" aria-hidden="true" /> : null}
          <p>{t('history.empty')}</p>
        </div>
          : entries.length === 0 ? <div className="xmimo-tts-history-empty" role="status"><p>{t('history.noResults')}</p><Button type="button" onClick={() => { setQuery(''); setSource('all') }}>{t('history.resetFilters')}</Button></div>
            : <ul className="xmimo-tts-history-list">
              {entries.map((entry) => <li key={entry.id} className={`xmimo-tts-history-row${entry.id === playback.entryId ? ' xmimo-tts-history-row-selected' : ''}`}>
                <Button type="button" className="xmimo-tts-history-play" aria-label={`${t(entry.id === playback.entryId && busy ? 'history.pause' : 'history.listen')}: ${title(entry).slice(0, 60)}`} onClick={() => {
                  if (entry.id === playback.entryId && busy) replay.pause()
                  else void replay.play(entry)
                }}>{entry.id === playback.entryId && busy ? 'Ⅱ' : '▷'}</Button>
                <div className="xmimo-tts-history-copy">
                  <button type="button" className={`xmimo-tts-history-text${expanded === entry.id ? ' xmimo-tts-history-text-expanded' : ''}`} aria-expanded={expanded === entry.id} aria-label={`${t('history.expand')}: ${title(entry).slice(0, 60)}`} onClick={() => { setExpanded(expanded === entry.id ? null : entry.id) }}>{title(entry)}</button>
                  <div className="xmimo-tts-history-meta">
                    <span>{t(`history.${entry.source}`)}</span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString()}</time>
                    <span>{entry.format.toUpperCase()} · {historyFileSize(entry.blob.size)}</span>
                  </div>
                </div>
                <div className="xmimo-tts-history-actions">
                  <Button type="button" aria-label={`${t('history.download')}: ${title(entry).slice(0, 60)}`} onClick={() => { download(entry) }}>{t('history.download')}</Button>
                  <Button type="button" disabled={pending} className={deleting === entry.id ? 'xmimo-tts-history-confirm-delete' : undefined}
                    aria-label={`${t(deleting === entry.id ? 'history.confirmDelete' : 'history.delete')}: ${title(entry).slice(0, 60)}`}
                    onBlur={() => { if (!pending) setDeleting((current) => current === entry.id ? null : current) }}
                    onKeyDown={(event) => { if (event.key === 'Escape') setDeleting(null) }}
                    onClick={() => {
                      if (deleting === entry.id) void mutate(entry.id)
                      else { setDeleting(entry.id); setClearing(false) }
                    }}>{t(deleting === entry.id ? 'history.confirmDelete' : 'history.delete')}</Button>
                </div>
              </li>)}
            </ul>}
    </div>
    {hasEntries ? <footer className="xmimo-tts-history-player" aria-label={t('history.player')}>
      {selected ? <>
        <div className="xmimo-tts-history-player-layout">
          <Button type="button" variant="primary" className="xmimo-tts-history-player-toggle" aria-label={playbackLabel} title={playbackLabel} onClick={() => { if (busy) replay.pause(); else void replay.play(selected) }}>
            {playback.status === 'error' ? <IconRefreshOutlineMedium size={18} aria-hidden="true" /> : <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" focusable="false" fill="currentColor">
              {busy ? <><rect x="4" y="3" width="3.5" height="12" rx="1" /><rect x="10.5" y="3" width="3.5" height="12" rx="1" /></> : <path d="M6 3.8a.8.8 0 0 1 1.2-.7l7.3 5.2a.85.85 0 0 1 0 1.4l-7.3 5.2a.8.8 0 0 1-1.2-.7Z" />}
            </svg>}
          </Button>
          <div className="xmimo-tts-history-player-content">
            <p className="xmimo-tts-history-now" title={title(selected)}>{title(selected)}</p>
            <div className="xmimo-tts-history-player-controls">
              <input type="range" style={progressStyle} min={0} max={playback.duration || 1} step={0.1} value={Math.min(playback.currentTime, playback.duration || 1)} disabled={playback.duration <= 0 || playback.status === 'error'} aria-label={t('history.seek')} aria-valuetext={`${historyTime(playback.currentTime)} / ${durationLabel}`} onChange={(event) => { replay.seek(Number(event.target.value)) }} />
              <span className="xmimo-tts-history-time">{historyTime(playback.currentTime)} / {durationLabel}</span>
            </div>
          </div>
        </div>
        <span className={playback.status === 'error' ? 'xmimo-tts-history-player-error xmimo-tts-failed' : 'xmimo-tts-history-player-status'} role="status">{t(playback.status === 'error' ? `history.error.${playback.error ?? 'failed'}` : `history.state.${playback.status}`)}</span>
      </> : <p className="xmimo-tts-history-meta">{t('history.selectAudio')}</p>}
    </footer> : null}
  </section>
}
