interface MusicPanelAudioFocus {
  begin(reason: string): void
  end(reason: string): void
}

// The music panel expires abandoned requests after 60 seconds by default.
const RENEW_MS = 30_000

function musicPanelAudioFocus(): MusicPanelAudioFocus | undefined {
  if (typeof window === 'undefined') return undefined
  const focus = (window as Window & { __dshMusicAudioFocus?: MusicPanelAudioFocus }).__dshMusicAudioFocus
  if (typeof focus?.begin === 'function' && typeof focus.end === 'function') return focus
}

/** One optional ducking request per active speech playback. */
export class MusicAudioFocus {
  private lease: { focus: MusicPanelAudioFocus; reason: string; renew: ReturnType<typeof setInterval> } | null = null

  acquire(): void {
    if (this.lease !== null) return
    try {
      const focus = musicPanelAudioFocus()
      if (focus === undefined) return
      const id = crypto.getRandomValues(new Uint32Array(4)).join('-')
      const reason = `dsh-xiaomi-tts:${id}`
      focus.begin(reason)
      const renew = setInterval(() => {
        try {
          if (musicPanelAudioFocus() === focus) focus.begin(reason)
        } catch { /* Music ducking is optional. */ }
      }, RENEW_MS)
      this.lease = { focus, reason, renew }
    } catch { /* Music ducking is optional. */ }
  }

  release(): void {
    const lease = this.lease
    if (lease === null) return
    this.lease = null
    clearInterval(lease.renew)
    try { lease.focus.end(lease.reason) } catch { /* The music panel also expires requests. */ }
  }
}
