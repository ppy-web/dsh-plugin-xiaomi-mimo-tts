import { Service, type Context } from '@deepseek-ai/cordis'
import type { XiaomiMimoTtsService } from '../../client-api.js'
import { prepareTtsText, resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import { streamPcmAudio } from '../../pcm-stream.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AudioHistory } from '../history/audio-history.js'
import { PcmRecording } from '../history/pcm-recording.js'
import { ttsSelection } from '../../types/providers.js'
import { DuplexPcmStream } from './duplex-pcm.js'

export class XiaomiMimoTtsPcmService extends Service implements XiaomiMimoTtsService {
  private readonly audio = new PcmAudioQueue({
    onBusyChange: (busy) => { this.audioBusy = busy },
    onPlaybackStart: () => {},
  })
  private request: AbortController | null = null
  private generation = 0
  private disposed = false
  private audioBusy = false
  private externalGeneration: number | null = null

  isBusy = (): boolean => this.request !== null || this.audioBusy

  /** Returns a generation-scoped stop handle; public play() keeps its interrupting behavior. */
  tryPlay(text: string, isBusy: () => boolean): (() => void) | null {
    if (this.isBusy() || isBusy()) return null
    const previous = this.generation
    // An idle collector must not mark a waiting conversation turn as stopped.
    this.start(text, false)
    if (this.generation === previous) return null
    const generation = this.generation
    return () => { if (this.generation === generation) this.stop() }
  }

  constructor(
    ctx: Context,
    private readonly settings: ConfigForm<TtsSettings>,
    private readonly interruptConversationPlayback: () => void,
    private readonly history?: AudioHistory,
    private readonly canPlay: () => boolean = () => true,
  ) {
    super(ctx, 'xiaomiMimoTts')
  }

  play(text: string): void {
    try {
      if (!resolveTtsSettings(this.settings.getSnapshot().value).announcementSources.includes('dsh-whale-musume')) return
      const previous = this.generation
      this.start(text)
      if (previous !== this.generation) this.externalGeneration = this.generation
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional playback settings unavailable: ${String(error)}`)
    }
  }

  stopExternal(): void {
    if (this.externalGeneration === this.generation) this.stop()
  }

  private start(text: string, interruptConversation = true): void {
    try {
      if (this.disposed || !this.canPlay() || typeof text !== 'string') {
        return
      }
      const snapshot = this.settings.getSnapshot()
      if (snapshot.status !== 'ready') {
        return
      }
      if (snapshot.value?.enabled !== true) {
        return
      }
      const normalized = prepareTtsText(text).trim()
      if (normalized.length === 0) {
        return
      }

      const settings = resolveTtsSettings(snapshot.value)
      this.stop()
      this.history?.stopReplay()
      if (interruptConversation) this.interruptConversationPlayback()
      this.audio.setMaxPausedPcmBytes(settings.maxPausedPcmBytes)
      this.audio.setVolume(settings.voiceVolume)
      this.audio.setPlaybackRate(settings.provider === 'xiaomi' ? settings.voiceRate : 1)

      const generation = this.generation
      const controller = new AbortController()
      this.request = controller
      const recording = new PcmRecording()
      const consume = async (bytes: Uint8Array): Promise<void> => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        recording.appendBytes(bytes)
        await this.audio.enqueueBytes(bytes)
      }
      const synthesize = async (): Promise<void> => {
        if (settings.provider === 'doubao') {
          const stream = new DuplexPcmStream(ttsSelection(settings), controller.signal, consume, settings.maxPausedPcmBytes, settings.requestTimeoutMs, settings.maxTextLength)
          stream.append(normalized)
          await stream.finish()
          return
        }
        await streamPcmAudio(normalized, controller.signal, async (pcm) => {
          if (this.disposed || controller.signal.aborted || generation !== this.generation) {
            return
          }
          recording.append(pcm)
          await this.audio.enqueue(pcm)
        }, ttsSelection({ ...settings, model: 'mimo-v2.5-tts' }))
      }
      void synthesize().then(() => {
        if (!this.disposed && !controller.signal.aborted && generation === this.generation) {
          recording.save(this.history, { text: normalized, source: 'service', voiceRateApplied: settings.provider !== 'xiaomi' })
        }
      }).catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback failed: ${error instanceof Error ? error.message : String(error)}`)
        this.audio.stop()
      }).finally(() => {
        if (this.request === controller) this.request = null
      })
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not start: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  stop(): void {
    try {
      this.generation += 1
      this.request?.abort()
      this.request = null
      this.audio.stop()
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not stop cleanly: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  setVolume(value: number): void { this.audio.setVolume(value) }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    await this.audio.dispose()
  }
}
