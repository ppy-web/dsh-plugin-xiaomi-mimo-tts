import type { Announcement, AnnouncementSourceId } from './types.js'
import type { XiaomiMimoTtsPcmService } from '../playback/pcm-play-service.js'
import type { SpeechActivity } from './speech-activity.js'
import type { QuestionTitlePlayback } from './question-playback.js'

export class AnnouncementPlayback {
  private readonly stops = new Map<AnnouncementSourceId, () => void>()

  constructor(private readonly service: XiaomiMimoTtsPcmService, private readonly activity: SpeechActivity, private readonly questions?: QuestionTitlePlayback,
    private readonly importantFirst: () => boolean = () => false) {}

  play = (event: Announcement): void => {
    if (event.signal?.aborted) return
    if (event.source === 'question-titles') { this.questions?.play(event); return }
    const stop = this.service.tryPlay(event.text, this.activity.isBusy, event.important && this.importantFirst() ? this.activity.interrupt : undefined)
    if (!stop) return
    this.stops.get(event.source)?.()
    const cleanup = () => {
      event.signal?.removeEventListener('abort', cleanup)
      stop()
      if (this.stops.get(event.source) === cleanup) this.stops.delete(event.source)
    }
    this.stops.set(event.source, cleanup)
    event.signal?.addEventListener('abort', cleanup, { once: true })
    if (event.signal?.aborted) cleanup()
  }

  stop = (source: AnnouncementSourceId): void => {
    if (source === 'question-titles') this.questions?.stop()
    this.stops.get(source)?.()
    this.stops.delete(source)
  }
}
