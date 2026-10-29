import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { RiArrowLeftSLine, RiCheckLine, RiDeleteBinLine, RiDownloadLine } from 'react-icons/ri'
import { Button, Input, IconRefreshOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AudioHistory, AudioHistoryEntry } from './audio-history.js'
import type { Translate } from '../localization.js'
import { filterAudioHistory, HistoryDownloads, historyFileSize, historyTime } from './history-list.js'
import type { HistorySource } from './history-list.js'
import { HistoryReplay } from './history-replay.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { isSpeechBusy } from '../announcements/speech-activity.js'
import { hostRoute } from '../host-route.js'
import { PlaybackIcon } from '../playback/playback-icon.js'
import { VoiceReadingSelect } from '../settings/voice-reading-select.js'

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

export function AudioHistoryPage({ history, t, volume, voiceRate, minimalMode, speechActivity, beforePlayback, onBack }: AudioHistoryPageProps): ReactElement {
  const view = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const [replay] = useState(() => new HistoryReplay(history, beforePlayback))
  useEffect(() => speechActivity?.register(() => isSpeechBusy(replay.getSnapshot().status)), [speechActivity, replay])
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
  const pageRef = useRef<HTMLElement>(null)
  useEffect(() => {
    replay.activate()
    backRef.current?.focus({ preventScroll: true })
    return () => { replay.dispose(); downloads.dispose() }
  }, [replay, downloads])
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
  const entries = filterAudioHistory(view.entries, query, source)
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
      const focusTarget = searchRef.current?.getClientRects().length ? searchRef.current : backRef.current
      focusTarget?.focus({ preventScroll: true })
    } catch { setActionError(true) }
    finally { setPending(false) }
  }
  const download = (entry: AudioHistoryEntry): void => {
    setActionError(false)
    try { downloads.download(entry) } catch { setActionError(true) }
  }
  return <section ref={pageRef} tabIndex={-1} className="xmimo-ui-scope xmimo-tts-history-page" aria-label={t('history.title')}>
    <header className="xmimo-tts-history-header">
      <h2 aria-label={t('history.title')}>
        <button ref={backRef} type="button" className="xmimo-tts-history-title-back"
          aria-label={t('history.backToSettings')} title={t('history.backToSettings')} onClick={onBack}>
          <RiArrowLeftSLine size={18} aria-hidden="true" focusable="false" />
          <span>{t('history.title')}</span>
        </button>
        <span className="xmimo-tts-history-count">{view.entries.length}</span>
      </h2>
      {hasEntries ? <div className="xmimo-tts-history-toolbar">
        <Input ref={searchRef} type="search" className="xmimo-tts-history-search" aria-label={t('history.search')} placeholder={t('history.search')} value={query} onChange={(event) => { setQuery(event.target.value); setDeleting(null) }} />
        <div className="xmimo-tts-history-source">
          <VoiceReadingSelect label={t('history.source')} value={source} disabled={pending}
            options={(['all', 'conversation', 'preview', 'service'] as const).map(id => ({ id, label: t(`history.${id}`) }))}
            onSelect={(id) => { setSource(id as HistorySource); setDeleting(null) }} />
        </div>
        <Button type="button" variant="outline" disabled={pending || view.status === 'loading'} className={`xmimo-tts-history-action${clearing ? ' xmimo-tts-history-confirm-delete' : ''}`}
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
                <Button type="button" variant="primary" className="xmimo-tts-history-player-toggle" title={entry.id === playback.entryId ? playbackLabel : t('history.listen')} aria-label={`${entry.id === playback.entryId ? playbackLabel : t('history.listen')}: ${title(entry).slice(0, 60)}`} onClick={() => {
                  if (entry.id === playback.entryId && busy) replay.pause()
                  else void replay.play(entry)
                }}>{entry.id === playback.entryId && playback.status === 'error' ? <IconRefreshOutlineMedium size={16} aria-hidden="true" /> : <PlaybackIcon state={entry.id !== playback.entryId || !busy ? 'play' : 'pause'} />}</Button>
                <div className="xmimo-tts-history-copy">
                  <button type="button" className={`xmimo-tts-history-text${expanded === entry.id ? ' xmimo-tts-history-text-expanded' : ''}`} aria-expanded={expanded === entry.id} aria-label={`${t('history.expand')}: ${title(entry).slice(0, 60)}`} onClick={() => { setExpanded(expanded === entry.id ? null : entry.id) }}>{title(entry)}</button>
                  <div className="xmimo-tts-history-meta">
                    <span>{t(`history.${entry.source}`)}</span>
                    <span>{Array.from(title(entry)).length} {t('history.characters')}</span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString()}</time>
                    <span>{entry.format.toUpperCase()} · {historyFileSize(entry.blob.size)}</span>
                  </div>
                  {entry.id === playback.entryId ? <div className="xmimo-tts-history-player" aria-label={t('history.player')}>
                    <div className="xmimo-tts-history-player-controls">
                      <input type="range" style={progressStyle} min={0} max={playback.duration || 1} step={0.1} value={Math.min(playback.currentTime, playback.duration || 1)} disabled={playback.duration <= 0 || playback.status === 'error'} aria-label={t('history.seek')} aria-valuetext={`${historyTime(playback.currentTime)} / ${durationLabel}`} onChange={(event) => { replay.seek(Number(event.target.value)) }} />
                      <span className="xmimo-tts-history-time">{historyTime(playback.currentTime)} / {durationLabel}</span>
                    </div>
                    <span className={playback.status === 'error' ? 'xmimo-tts-history-player-error xmimo-tts-failed' : 'xmimo-tts-history-player-status'} role="status">{t(playback.status === 'error' ? `history.error.${playback.error ?? 'failed'}` : `history.state.${playback.status}`)}</span>
                  </div> : null}
                </div>
                <div className="xmimo-tts-history-actions">
                  <Button type="button" variant="outline" className="xmimo-tts-history-action" title={t('history.download')} aria-label={`${t('history.download')}: ${title(entry).slice(0, 60)}`} onClick={() => { download(entry) }}><RiDownloadLine aria-hidden="true" /><span>{t('history.download')}</span></Button>
                  <Button type="button" variant="outline" disabled={pending} className={`xmimo-tts-history-action${deleting === entry.id ? ' xmimo-tts-history-confirm-delete' : ''}`}
                    title={t(deleting === entry.id ? 'history.confirmDelete' : 'history.delete')}
                    aria-label={`${t(deleting === entry.id ? 'history.confirmDelete' : 'history.delete')}: ${title(entry).slice(0, 60)}`}
                    onBlur={() => { if (!pending) setDeleting((current) => current === entry.id ? null : current) }}
                    onKeyDown={(event) => { if (event.key === 'Escape') setDeleting(null) }}
                    onClick={() => {
                      if (deleting === entry.id) void mutate(entry.id)
                      else { setDeleting(entry.id); setClearing(false) }
                    }}>{deleting === entry.id ? <RiCheckLine aria-hidden="true" /> : <RiDeleteBinLine aria-hidden="true" />}<span>{t(deleting === entry.id ? 'history.confirmDelete' : 'history.delete')}</span></Button>
                </div>
              </li>)}
            </ul>}
    </div>
    <footer className="xmimo-tts-history-footer">
      {hasEntries ? <div className="xmimo-tts-history-storage">
        <span>{t(view.status === 'memory' ? 'history.temporary' : 'history.savedHere')} · {view.entries.length} · {historyFileSize(view.entries.reduce((sum, entry) => sum + entry.blob.size, 0))}</span>
        <span className="xmimo-tts-history-limit">{t('history.hint')}</span>
      </div> : null}
    </footer>
  </section>
}
