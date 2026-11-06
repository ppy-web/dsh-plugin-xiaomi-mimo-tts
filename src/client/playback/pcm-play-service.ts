import { Service, type Context } from '@deepseek-ai/cordis'
import type { XiaomiMimoTtsService } from '../../client-api.js'
import { prepareProviderTtsText, resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import { streamPcmAudio } from '../../pcm-stream.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AudioHistory } from '../history/audio-history.js'
import { PcmRecording } from '../history/pcm-recording.js'
import { ttsSelection } from '../../types/providers.js'
import { DuplexPcmStream } from './duplex-pcm.js'
import type { SnapshotSource } from '../plugin-activity.js'
import { engineCanRequest, engineMaxTextLength, engineText, externalEngine, splitExternalText } from '../engine-state.js'
import { playSegmentAudio, prefetchSegmentAudio } from './segmented-audio.js'

export class XiaomiMimoTtsPcmService extends Service implements XiaomiMimoTtsService {
  private readonly audio = new PcmAudioQueue({
    onBusyChange: (busy) => { this.audioBusy = busy; this.refreshPriority() },
    onPlaybackStart: () => {},
  })
  private request: AbortController | null = null
  private generation = 0
  private disposed = false
  private audioBusy = false
  private media: HTMLAudioElement | null = null
  private externalGeneration: number | null = null
  private priorityGeneration: number | null = null
  private priorityBusy = false
  private readonly priorityListeners = new Set<() => void>()

  readonly priorityActivity: SnapshotSource<boolean> = {
    getSnapshot: () => this.priorityBusy,
    subscribe: listener => {
      this.priorityListeners.add(listener)
      return () => { this.priorityListeners.delete(listener) }
    },
  }

  private refreshPriority(): void {
    const busy = this.priorityGeneration === this.generation && this.isBusy()
    if (busy === this.priorityBusy) return
    this.priorityBusy = busy
    for (const listener of this.priorityListeners) listener()
  }

  isBusy = (): boolean => this.request !== null || this.audioBusy

  /** Returns a generation-scoped stop handle; public play() keeps its interrupting behavior. */
  tryPlay(text: string, isBusy: () => boolean, interrupt?: () => void): (() => void) | null {
    if (this.isBusy() && this.priorityGeneration === this.generation) return null
    if (interrupt === undefined && (this.isBusy() || isBusy())) return null
    const previous = this.generation
    // An idle collector must not mark a waiting conversation turn as stopped.
    this.start(text, false, interrupt)
    if (this.generation === previous) return null
    const generation = this.generation
    if (interrupt !== undefined) this.priorityGeneration = generation
    this.refreshPriority()
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
      if (this.isBusy() && this.priorityGeneration === this.generation) return
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

  private start(text: string, interruptConversation = true, beforePlayback?: () => void): void {
    try {
      if (this.disposed || !this.canPlay() || !engineCanRequest() || typeof text !== 'string') {
        return
      }
      const snapshot = this.settings.getSnapshot()
      if (snapshot.status !== 'ready') {
        return
      }
      if (snapshot.value?.enabled !== true) {
        return
      }
      const settings = resolveTtsSettings(snapshot.value)
      const normalized = engineText(text, () => prepareProviderTtsText(text, settings)).trim()
      if (normalized.length === 0) {
        return
      }

      this.stop()
      this.history?.stopReplay()
      beforePlayback?.()
      if (interruptConversation) this.interruptConversationPlayback()
      this.audio.setMaxPausedPcmBytes(settings.maxPausedPcmBytes)
      this.audio.setVolume(settings.voiceVolume)
      this.audio.setPlaybackRate(externalEngine() || settings.provider === 'xiaomi' ? settings.voiceRate : 1)

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
        const external = externalEngine()
        if (external?.streaming) {
          for (const segment of splitExternalText(normalized, engineMaxTextLength(settings.maxTextLength))) {
            await streamPcmAudio(segment, controller.signal, async pcm => {
              if (this.disposed || controller.signal.aborted || generation !== this.generation) return
              recording.append(pcm)
              await this.audio.enqueue(pcm)
            })
          }
          return
        }
        if (external && !external.streaming) {
          const limit = engineMaxTextLength(settings.maxTextLength)
          for (const segment of splitExternalText(normalized, limit)) {
            controller.signal.throwIfAborted()
            const result = await prefetchSegmentAudio(segment, controller.signal)
            if (!result.ok) throw result.error
            controller.signal.throwIfAborted()
            void this.history?.add({ blob: result.blob, text: segment, format: 'wav', source: 'service', voiceRateApplied: false })
            await playSegmentAudio(result.blob, { signal: controller.signal, volume: settings.voiceVolume, voiceRate: settings.voiceRate, automatic: false,
              onCreated: audio => { this.media = audio }, onReleased: () => { this.media = null }, onStarted: () => {} })
          }
          return
        }
        if (!external && settings.provider === 'doubao') {
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
          recording.save(this.history, { text: normalized, source: 'service', voiceRateApplied: !externalEngine() && settings.provider !== 'xiaomi' })
        }
      }).catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback failed: ${error instanceof Error ? error.message : String(error)}`)
        this.audio.stop()
      }).finally(() => {
        if (this.request === controller) this.request = null
        this.refreshPriority()
      })
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not start: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  stop(): void {
    try {
      this.generation += 1
      this.priorityGeneration = null
      this.request?.abort()
      this.request = null
      this.audio.stop()
      this.refreshPriority()
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not stop cleanly: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  setVolume(value: number): void { this.audio.setVolume(value); if (this.media) this.media.volume = value }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    await this.audio.dispose()
  }
}
