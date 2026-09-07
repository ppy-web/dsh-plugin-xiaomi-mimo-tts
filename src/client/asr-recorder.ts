/**
 * Browser microphone capture for one dictation recording.
 *
 * `getUserMedia` feeds an AudioWorklet that downmixes to mono and reports
 * ~50 ms blocks with an RMS value; the main thread resamples to 16 kHz and
 * accumulates PCM16 frames. The recorder hard-stops at the 120-second sample
 * ceiling and tears down the MediaStream, AudioContext, and worklet URL on
 * stop, cancel, or error.
 */
import { ASR_WORKLET_SOURCE, LinearResampler, PcmRecorder, normalizeAsrLevel } from '../asr-core.js'
import { ASR_SAMPLE_RATE } from '../shared.js'

export type AsrRecorderFailure = 'permission' | 'unsupported' | 'worklet' | 'device'

export interface AsrRecorderHandlers {
  /** Normalized 0–1 input level, emitted roughly every 50 ms. */
  onLevel?: (level: number) => void
  /** The 120-second sample ceiling was reached; the recorder stops itself. */
  onLimit?: () => void
}

const WORKLET_NAME = 'xmimo-asr-capture'

export class AsrRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private workletUrl: string | null = null
  private node: AudioWorkletNode | null = null
  private silentGain: GainNode | null = null
  private resampler: LinearResampler | null = null
  private readonly recorder = new PcmRecorder()
  private active = false
  private stopped = false

  /** PCM16 frames accumulated at the target rate. */
  get frameCount(): number {
    return this.recorder.frameCount
  }

  /** Recording duration in whole seconds (floor). */
  get seconds(): number {
    return Math.floor(this.recorder.frameCount / ASR_SAMPLE_RATE)
  }

  get recording(): boolean {
    return this.active
  }

  /** Request the microphone, install the worklet, and start accumulating audio. */
  async start(handlers: AsrRecorderHandlers = {}): Promise<void> {
    if (this.active || this.stopped) throw new Error('asr-recorder-already-started')
    if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
      throw Object.assign(new Error('asr-unsupported'), { code: 'unsupported' as AsrRecorderFailure })
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      throw Object.assign(new Error(`asr-capture-${name || 'failed'}`), {
        code: (name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : 'device') as AsrRecorderFailure,
      })
    }

    const context = new AudioContext()
    const workletUrl = URL.createObjectURL(new Blob([ASR_WORKLET_SOURCE], { type: 'application/javascript' }))
    try {
      await context.audioWorklet.addModule(workletUrl)
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop())
      void context.close().catch(() => {})
      URL.revokeObjectURL(workletUrl)
      throw Object.assign(new Error('asr-worklet-failed'), { code: 'worklet' as AsrRecorderFailure })
    }

    this.stream = stream
    this.context = context
    this.workletUrl = workletUrl
    this.resampler = new LinearResampler(context.sampleRate, ASR_SAMPLE_RATE)
    this.recorder.clear()

    const node = new AudioWorkletNode(context, WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    node.port.onmessage = (event: MessageEvent) => this.onWorkletMessage(event.data, handlers)
    const source = context.createMediaStreamSource(stream)
    // The worklet output is silence; a zero gain keeps the graph active without audible output.
    const silentGain = context.createGain()
    silentGain.gain.value = 0
    source.connect(node)
    node.connect(silentGain)
    silentGain.connect(context.destination)

    this.node = node
    this.silentGain = silentGain
    this.active = true
  }

  private onWorkletMessage(data: unknown, handlers: AsrRecorderHandlers): void {
    if (!this.active || data === null || typeof data !== 'object') return
    const message = data as { type?: string; pcm?: unknown; rms?: unknown }
    if (message.type === 'limit') {
      if (!this.recorder.limitReached) handlers.onLimit?.()
      return
    }
    if (message.type !== 'audio') return
    const pcm = message.pcm
    const rms = typeof message.rms === 'number' && Number.isFinite(message.rms) ? message.rms : 0
    if (!(pcm instanceof Float32Array) || this.resampler === null) return
    this.recorder.push(this.resampler.push(pcm))
    handlers.onLevel?.(normalizeAsrLevel(rms))
    if (this.recorder.limitReached) handlers.onLimit?.()
  }

  /**
   * Stop capturing and encode the accumulated audio as a WAV file.
   * Returns null when no usable audio was captured. Safe to call twice.
   */
  async stop(): Promise<Uint8Array<ArrayBuffer> | null> {
    this.active = false
    const hadFrames = this.recorder.frameCount > 0
    const wav = hadFrames ? this.recorder.toWav() : null
    await this.teardown()
    this.stopped = true
    return wav
  }

  /** Release every resource without producing audio (session switch, unmount). */
  async dispose(): Promise<void> {
    this.active = false
    this.recorder.clear()
    await this.teardown()
    this.stopped = true
  }

  private async teardown(): Promise<void> {
    if (this.node !== null) {
      try { this.node.port.onmessage = null } catch {}
      try { this.node.disconnect() } catch {}
      this.node = null
    }
    if (this.silentGain !== null) {
      try { this.silentGain.disconnect() } catch {}
      this.silentGain = null
    }
    if (this.stream !== null) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    const context = this.context
    this.context = null
    if (context !== null) {
      try { await context.close() } catch { /* already closed */ }
    }
    if (this.workletUrl !== null) {
      URL.revokeObjectURL(this.workletUrl)
      this.workletUrl = null
    }
  }
}
