/**
 * MiMo V2.5 ASR single-shot dictation core.
 *
 * Pure, DOM-free building blocks shared by the browser recorder and the Node
 * test suite: linear resampling with inter-chunk carry, PCM16 WAV encoding,
 * RMS volume normalization, transcription draft merging, and SSE delta
 * extraction for `choices[0].delta.content`.
 */
import { ASR_SAMPLE_RATE, parseSseRecords } from './shared.js'

/** Hard recording ceiling in frames (120 s × 16 kHz), enforced by actual sample count. */
export const MAX_ASR_FRAMES = 120 * ASR_SAMPLE_RATE

/** Device-rate frames accumulated in the worklet before one postMessage (~50 ms at 48 kHz). */
export const ASR_WORKLET_FLUSH_FRAMES = 1024

/** Minimum interval between incremental draft writes while streaming (ms). */
export const ASR_DRAFT_WRITE_INTERVAL_MS = 150

/** Map one RMS value (0–1 of full scale) to the 0–1 glow level used by the UI. */
export function normalizeAsrLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0
  // Speech RMS sits around 0.02–0.35; a 3× gain keeps silence quiet while
  // normal speech reaches the upper half of the glow range.
  return Math.min(1, rms * 3)
}

/** Compute the root-mean-square of a mono Float32 frame block. */
export function rmsOfFrames(frames: Float32Array): number {
  if (frames.length === 0) return 0
  let sum = 0
  for (let index = 0; index < frames.length; index++) {
    const sample = frames[index]!
    sum += sample * sample
  }
  return Math.sqrt(sum / frames.length)
}

/**
 * Streaming linear resampler with fractional carry so chunked pushes produce
 * the same output as one whole-buffer resample.
 *
 * Emission positions walk the combined stream `[previousLastSample, chunk…]`;
 * the first output of a stream is exactly `chunk[0]`, downsampling takes every
 * `step`-th sample, and the fractional remainder carries into the next push.
 */
export class LinearResampler {
  private position = 1
  private previous = 0

  constructor(readonly sourceRate: number, readonly targetRate: number = ASR_SAMPLE_RATE) {
    if (!(sourceRate > 0) || !(targetRate > 0)) throw new Error('invalid-resampler-rates')
  }

  /** Reset streaming state (call when the input stream restarts). */
  reset(): void {
    this.position = 1
    this.previous = 0
  }

  /** Resample one mono chunk; consecutive chunks stay phase-continuous. */
  push(chunk: Float32Array): Float32Array {
    const length = chunk.length
    if (length === 0) return new Float32Array(0)
    const step = this.sourceRate / this.targetRate
    const start = this.position
    let count = Math.ceil((length - start) / step)
    if (!(count > 0)) return new Float32Array(0)
    const output = new Float32Array(count)
    for (let index = 0; index < count; index++) {
      const position = start + index * step
      const sourceIndex = Math.floor(position)
      const fraction = position - sourceIndex
      const before = sourceIndex === 0 ? this.previous : chunk[sourceIndex - 1]!
      const after = chunk[sourceIndex]!
      output[index] = before + (after - before) * fraction
    }
    this.position = start + count * step - length
    this.previous = chunk[length - 1]!
    return output
  }
}

/** Clamp a float sample into PCM16 and return its 16-bit integer form. */
export function floatToPcm16(sample: number): number {
  const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample
  return Math.round(clamped * 32767)
}

/** Convert mono float samples to little-endian PCM16 bytes. */
export function floatToPcm16Bytes(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index++) {
    view.setInt16(index * 2, floatToPcm16(samples[index]!), true)
  }
  return bytes
}

/**
 * Encode mono PCM16 samples as a canonical 44-byte-header WAV file.
 * Layout: RIFF/WAVE + 16-byte PCM fmt chunk + data chunk, little-endian.
 */
export function encodeWavPcm16Mono(samples: Int16Array, sampleRate: number = ASR_SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * 2
  const wav = new Uint8Array(44 + dataBytes)
  const view = new DataView(wav.buffer)
  writeAscii(wav, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(wav, 8, 'WAVE')
  writeAscii(wav, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate = rate × block align
  view.setUint16(32, 2, true) // block align = channels × bytes per sample
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(wav, 36, 'data')
  view.setUint32(40, dataBytes, true)
  wav.set(new Uint8Array(samples.buffer, samples.byteOffset, dataBytes), 44)
  return wav
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index++) target[offset + index] = text.charCodeAt(index)
}

/**
 * In-memory PCM16 accumulator with the 120-second hard stop measured in
 * actual output frames; frames beyond the ceiling are dropped so the encoded
 * WAV never exceeds the limit.
 */
export class PcmRecorder {
  private chunks: Int16Array[] = []
  private frames = 0

  constructor(readonly sampleRate: number = ASR_SAMPLE_RATE, readonly maxFrames: number = MAX_ASR_FRAMES) {}

  /** Output frames accumulated so far. */
  get frameCount(): number {
    return this.frames
  }

  /** Whether the hard stop ceiling has been reached. */
  get limitReached(): boolean {
    return this.frames >= this.maxFrames
  }

  /** Append resampled mono float samples, trimming anything past the ceiling. */
  push(samples: Float32Array): void {
    if (samples.length === 0 || this.limitReached) return
    const remaining = this.maxFrames - this.frames
    const accepted = samples.length <= remaining ? samples : samples.subarray(0, remaining)
    const pcm = new Int16Array(accepted.length)
    for (let index = 0; index < accepted.length; index++) pcm[index] = floatToPcm16(accepted[index]!)
    this.chunks.push(pcm)
    this.frames += accepted.length
  }

  /** Concatenated PCM16 samples accumulated so far. */
  toInt16(): Int16Array {
    if (this.chunks.length === 1) return this.chunks[0]!
    const merged = new Int16Array(this.frames)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return merged
  }

  /** Encode the accumulated audio as a WAV file. */
  toWav(): Uint8Array<ArrayBuffer> {
    return encodeWavPcm16Mono(this.toInt16(), this.sampleRate)
  }

  /** Drop the buffered audio (session switch, permission failure, cancel). */
  clear(): void {
    this.chunks = []
    this.frames = 0
  }
}

/**
 * Merge transcribed text into a composer draft: empty drafts receive the
 * transcript verbatim, non-empty drafts are separated by one newline.
 */
export function joinAsrDraft(draft: string, transcript: string): string {
  if (draft.length === 0) return transcript
  if (transcript.length === 0) return draft
  return `${draft}\n${transcript}`
}

/**
 * Streaming draft writer with the "plugin last write" protection.
 *
 * While SSE deltas arrive, the draft is rewritten as `draft-at-start +
 * newline + transcript-so far` at most once per interval. Every value this
 * writer produced is remembered; when the live draft leaves that set, the
 * user edited concurrently, incremental writes stop, and the completion
 * flush appends the full transcript to whatever the draft holds then.
 */
export class AsrDraftWriter {
  private transcript = ''
  private readonly written: string[] = []
  private concurrent = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private done = false

  constructor(
    private readonly io: { getDraft(): string; setDraft(text: string): void },
    private readonly intervalMs: number = ASR_DRAFT_WRITE_INTERVAL_MS,
  ) {
    this.written.push(io.getDraft())
  }

  /** Transcription text accumulated so far. */
  get text(): string {
    return this.transcript
  }

  /** Whether a concurrent user edit was detected during streaming. */
  get userEditedDuringStream(): boolean {
    return this.concurrent
  }

  /** Replace the accumulated transcription text and schedule the next throttled write. */
  setText(fullText: string): void {
    if (this.done || fullText.length === 0) return
    this.transcript = fullText
    if (this.timer === null && !this.concurrent) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.flush(false)
      }, this.intervalMs)
    }
  }

  /** Cancel pending writes; the draft keeps whatever was already written. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.done = true
  }

  /**
   * Write the current draft state. `final` completes the transcription:
   * the full transcript is appended (to the user's draft when they edited
   * concurrently), after which the writer stops writing.
   */
  flush(final: boolean): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.done) return
    const current = this.io.getDraft()
    if (!this.written.includes(current)) this.concurrent = true
    if (final) {
      this.done = true
      if (this.transcript.length === 0) return
      this.write(this.concurrent
        ? joinAsrDraft(current, this.transcript)
        : joinAsrDraft(this.written[0]!, this.transcript))
      return
    }
    if (this.concurrent || this.transcript.length === 0) return
    const next = joinAsrDraft(this.written[0]!, this.transcript)
    if (next !== current) this.write(next)
  }

  private write(next: string): void {
    this.written.push(next)
    this.io.setDraft(next)
  }
}

/** Extract `choices[0].delta.content` from one SSE data record; `[DONE]` yields null. */
export function asrDeltaFromSse(data: string): string | null {
  if (data === '[DONE]') return null
  const value = JSON.parse(data) as {
    choices?: Array<{ delta?: { content?: unknown } }>
    error?: string | { message?: string }
  }
  const upstreamError = typeof value.error === 'string' ? value.error : value.error?.message
  if (upstreamError !== undefined) throw new Error(upstreamError)
  const delta = value.choices?.[0]?.delta?.content
  return typeof delta === 'string' && delta.length > 0 ? delta : null
}

/** Split one raw SSE text chunk into complete transcription deltas. */
export function asrDeltasFromChunk(chunk: string): { deltas: string[]; remainder: string } {
  const { events, remainder } = parseSseRecords(chunk)
  const deltas: string[] = []
  for (const event of events) {
    const delta = asrDeltaFromSse(event)
    if (delta !== null) deltas.push(delta)
  }
  return { deltas, remainder }
}

/**
 * AudioWorklet processor source, loaded through a Blob URL. Downmixes the
 * device input to mono, computes one RMS per flushed block, and posts
 * `{ type: 'audio', pcm, rms }` blocks (~50 ms) plus a `{ type: 'limit' }`
 * signal once the device-side frame ceiling is crossed.
 */
export const ASR_WORKLET_SOURCE = `
class XmimoAsrCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.flushFrames = ${ASR_WORKLET_FLUSH_FRAMES}
    this.limitFrames = ${MAX_ASR_FRAMES} * (sampleRate / ${ASR_SAMPLE_RATE})
    this.sentFrames = 0
    this.buffer = new Float32Array(this.flushFrames * 4)
    this.buffered = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (input === undefined || input.length === 0) return true
    const frames = input[0] === undefined ? 0 : input[0].length
    if (frames === 0) return true
    for (let index = 0; index < frames; index++) {
      let sum = 0
      for (let channel = 0; channel < input.length; channel++) {
        const samples = input[channel]
        sum += samples === undefined ? 0 : samples[index] || 0
      }
      if (this.buffered >= this.buffer.length) {
        const grown = new Float32Array(this.buffer.length * 2)
        grown.set(this.buffer)
        this.buffer = grown
      }
      this.buffer[this.buffered] = sum / input.length
      this.buffered += 1
    }
    while (this.buffered >= this.flushFrames) {
      this.flush(this.flushFrames)
    }
    if (this.sentFrames >= this.limitFrames) {
      this.port.postMessage({ type: 'limit' })
    }
    return true
  }

  flush(count) {
    const pcm = this.buffer.slice(0, count)
    this.buffer.copyWithin(0, count, this.buffered)
    this.buffered -= count
    this.sentFrames += count
    let sum = 0
    for (let index = 0; index < pcm.length; index++) sum += pcm[index] * pcm[index]
    const rms = Math.sqrt(sum / pcm.length)
    this.port.postMessage({ type: 'audio', pcm, rms }, [pcm.buffer])
  }
}
registerProcessor('xmimo-asr-capture', XmimoAsrCaptureProcessor)
`
