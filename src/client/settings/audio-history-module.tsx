import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement, SyntheticEvent } from 'react'
import type { AudioHistory, AudioHistoryEntry } from '../history/audio-history.js'
import type { Translate } from '../localization.js'
import { applyMediaVoiceRate } from '../playback/voice-rate.js'
import { ModuleShell } from './module-shell.js'

interface AudioHistoryModuleProps {
  history: AudioHistory
  t: Translate
  volume: number
  voiceRate: number
  beforePlayback: () => void
}

function AudioHistoryRow({ entry, history, t, volume, voiceRate, beforePlayback }: Omit<AudioHistoryModuleProps, 'beforePlayback'> & {
  entry: AudioHistoryEntry
  beforePlayback: (event: SyntheticEvent<HTMLAudioElement>) => void
}): ReactElement {
  const [url, setUrl] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.blob)
    const media = audio.current
    setUrl(objectUrl)
    return () => {
      media?.pause()
      media?.removeAttribute('src')
      media?.load()
      URL.revokeObjectURL(objectUrl)
    }
  }, [entry.blob])
  useEffect(() => {
    if (audio.current === null) return
    audio.current.volume = volume
    applyMediaVoiceRate(audio.current, voiceRate)
  }, [volume, voiceRate, url])
  const source = entry.source === 'preview' ? 'history.preview' : entry.source === 'service' ? 'history.service' : 'history.conversation'
  const filename = `mimo-${new Date(entry.createdAt).toISOString().replace(/[:.]/gu, '-')}-${entry.id.slice(0, 8)}.${entry.format}`
  return <li className="xmimo-tts-history-row">
    <p className="xmimo-tts-history-text" title={entry.text}>{entry.text}</p>
    <div className="xmimo-tts-history-meta">
      <span>{t(source)}</span>
      <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString()}</time>
      <span>{entry.format.toUpperCase()} · {(entry.blob.size / 1024).toFixed(0)} KB</span>
    </div>
    <div className="xmimo-tts-history-controls">
      <audio ref={audio} controls preload="none" src={url || undefined} aria-label={`${t('history.listen')}: ${entry.text.slice(0, 60)}`} onPlay={beforePlayback} />
      <a href={url || undefined} download={filename}>{t('history.download')}</a>
      <button type="button" onClick={() => { void history.remove(entry.id) }} aria-label={`${t('history.delete')}: ${entry.text.slice(0, 60)}`}>{t('history.delete')}</button>
    </div>
  </li>
}

export function AudioHistoryModule({ history, t, volume, voiceRate, beforePlayback }: AudioHistoryModuleProps): ReactElement {
  const view = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => history.onStopReplay(() => {
    list.current?.querySelectorAll('audio').forEach((audio) => audio.pause())
  }), [history])
  const play = (event: SyntheticEvent<HTMLAudioElement>): void => {
    beforePlayback()
    for (const audio of Array.from(list.current?.querySelectorAll('audio') ?? [])) {
      if (audio !== event.currentTarget) audio.pause()
    }
  }
  return <ModuleShell className="xmimo-tts-history xmimo-ui-module-padded" title={<>{t('history.title')} <span className="xmimo-tts-history-count">{view.entries.length}</span></>}
    collapsible open={open} onToggle={() => { setOpen((value) => !value) }}>
    {open ? <div className="xmimo-ui-module-content">
      <p className="xmimo-tts-history-hint">{t('history.hint')}</p>
      {view.status === 'memory' ? <p className="xmimo-tts-failed" role="status">{t('history.memory')}</p> : null}
      {view.skipped ? <p className="xmimo-tts-failed" role="status">{t('history.skipped')}</p> : null}
      {view.status === 'loading' ? <p role="status">{t('history.loading')}</p>
        : view.entries.length === 0 ? <p role="status">{t('history.empty')}</p>
          : <>
            <div className="xmimo-tts-history-toolbar"><button type="button" onClick={() => { void history.clear() }}>{t('history.clear')}</button></div>
            <ul ref={list} className="xmimo-tts-history-list">
              {view.entries.map((entry) => <AudioHistoryRow key={entry.id} entry={entry} history={history} t={t} volume={volume} voiceRate={voiceRate} beforePlayback={play} />)}
            </ul>
          </>}
    </div> : null}
  </ModuleShell>
}
