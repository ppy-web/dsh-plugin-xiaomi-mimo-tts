import type { AudioHistoryEntry } from './audio-history.js'

export type HistorySource = AudioHistoryEntry['source'] | 'all'

export function filterAudioHistory(entries: readonly AudioHistoryEntry[], query: string, source: HistorySource): AudioHistoryEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  return entries.filter((entry) => (source === 'all' || entry.source === source)
    && entry.text.toLocaleLowerCase().includes(needle)).sort((a, b) => b.createdAt - a.createdAt)
}

export function historyFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${bytes === 0 ? 0 : Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function historyTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}

/** Downloads own their URLs until the browser has consumed the click or the page closes. */
export class HistoryDownloads {
  private pending = new Map<string, ReturnType<typeof setTimeout>>()

  download(entry: AudioHistoryEntry): void {
    const url = URL.createObjectURL(entry.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mimo-${new Date(entry.createdAt).toISOString().replace(/[:.]/gu, '-')}-${entry.id.slice(0, 8)}.${entry.format}`
    try {
      document.body.appendChild(anchor)
      anchor.click()
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    } finally {
      anchor.remove()
    }
    this.pending.set(url, setTimeout(() => {
      URL.revokeObjectURL(url)
      this.pending.delete(url)
    }, 1000))
  }

  dispose(): void {
    for (const [url, timer] of this.pending) {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
    this.pending.clear()
  }
}
