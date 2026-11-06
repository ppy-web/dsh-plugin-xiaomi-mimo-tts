import type { ResolvedTtsSettings } from '../../shared.js'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { Announcement } from './types.js'
import { isSpeechBusy, type SpeechActivity } from './speech-activity.js'

/** Transient questions reuse the preview transport's remote/local fallback without touching assistant deduplication. */
export class QuestionTitlePlayback {
  private readonly player = new PreviewPlayer(() => {})
  private release: (() => void) | null = null
  private readonly unregister: () => void

  constructor(
    private readonly activity: SpeechActivity,
    private readonly settings: () => ResolvedTtsSettings,
    private readonly pcmBusy: () => boolean,
  ) {
    this.unregister = activity.register(() => isSpeechBusy(this.player.getView().status), () => this.stop())
  }

  play(event: Announcement): void {
    const settings = this.settings()
    if (event.signal?.aborted || !settings.enabled || !settings.autoPlay || !settings.announcementSources.includes('question-titles')
      || this.activity.isBusy() || this.pcmBusy()) return
    this.stop()
    const stop = () => this.stop()
    event.signal?.addEventListener('abort', stop, { once: true })
    this.release = () => event.signal?.removeEventListener('abort', stop)
    void this.player.play(event.text, settings)
  }

  stop(): void { this.release?.(); this.release = null; this.player.stop() }
  setVolume(value: number): void { this.player.setVolume(value) }
  async dispose(): Promise<void> { this.stop(); this.unregister(); await this.player.dispose() }
}
