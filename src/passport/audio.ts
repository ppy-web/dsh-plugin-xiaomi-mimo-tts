/** The device wire carries PCM16LE mono; the Host recognizer consumes canonical WAV. */
export function pcmWave(pcm: Buffer, sampleRate = 16000): Buffer {
  if (!pcm.length || pcm.length % 2) throw new Error('passport-invalid-audio')
  const header = Buffer.alloc(44)
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** Read real RIFF chunks, downmix PCM16, and resample to the firmware's supported 24 kHz. */
export function playbackPcm(wave: Buffer, maxSeconds: number): Buffer {
  const invalid = () => new Error('passport-invalid-reply-audio')
  if (wave.length < 44 || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE'
    || wave.readUInt32LE(4) + 8 !== wave.length) throw invalid()
  let rate = 0, channels = 0, pcm: Buffer | undefined
  for (let offset = 12; offset + 8 <= wave.length;) {
    const size = wave.readUInt32LE(offset + 4), start = offset + 8, end = start + size
    if (end > wave.length) throw invalid()
    const id = wave.toString('ascii', offset, offset + 4)
    if (id === 'fmt ') {
      if (size < 16 || wave.readUInt16LE(start) !== 1 || wave.readUInt16LE(start + 14) !== 16) throw invalid()
      channels = wave.readUInt16LE(start + 2); rate = wave.readUInt32LE(start + 4)
      if (![1, 2].includes(channels) || rate < 8000 || rate > 192000
        || wave.readUInt16LE(start + 12) !== channels * 2 || wave.readUInt32LE(start + 8) !== rate * channels * 2) throw invalid()
    } else if (id === 'data') {
      if (pcm) throw invalid()
      pcm = wave.subarray(start, end)
    }
    offset = end + size % 2
  }
  if (!pcm?.length || !rate || !channels || pcm.length % (channels * 2)) throw invalid()
  const frames = pcm.length / (channels * 2)
  if (frames / rate > maxSeconds) throw new Error('passport-reply-too-long')
  const output = Buffer.alloc(Math.max(1, Math.floor(frames * 24000 / rate)) * 2)
  const sample = (index: number) => {
    const at = Math.min(frames - 1, index) * channels * 2
    return channels === 1 ? pcm!.readInt16LE(at) : (pcm!.readInt16LE(at) + pcm!.readInt16LE(at + 2)) / 2
  }
  for (let i = 0; i < output.length / 2; i++) {
    const position = i * rate / 24000, index = Math.floor(position), fraction = position - index
    output.writeInt16LE(Math.round(sample(index) * (1 - fraction) + sample(index + 1) * fraction), i * 2)
  }
  return output
}

export interface CaptureOptions {
  silenceMs: number
  minSpeechMs: number
  maxRecordingSeconds: number
  speechThreshold: number
}

/** Bounded 20 ms energy segmentation, with 200 ms pre-roll and a discard tail after oversized input. */
export class PcmUtterances {
  private remainder: Buffer = Buffer.alloc(0)
  private pre: Buffer[] = []
  private chunks: Buffer[] = []
  private frames = 0
  private speechFrames = 0
  private quietFrames = 0
  private discarding = false
  private streaming = false

  constructor(private readonly options: CaptureOptions,
    private readonly captured?: (pcm: Buffer, first: boolean) => void,
    private readonly discarded?: (code: string) => void) {}

  reset(): void {
    this.remainder = Buffer.alloc(0); this.pre = []; this.chunks = []
    this.frames = 0; this.speechFrames = 0; this.quietFrames = 0; this.discarding = false
    this.streaming = false
  }

  append(pcm: Buffer, manual = false): Buffer | undefined {
    this.remainder = Buffer.concat([this.remainder, pcm])
    while (this.remainder.length >= 640) {
      const frame = this.remainder.subarray(0, 640)
      this.remainder = this.remainder.subarray(640)
      let energy = 0
      for (let i = 0; i < 640; i += 2) energy += (frame.readInt16LE(i) / 32768) ** 2
      const voiced = Math.sqrt(energy / 320) >= this.options.speechThreshold
      this.quietFrames = voiced ? 0 : this.quietFrames + 1
      if (this.discarding) {
        if (this.quietFrames * 20 >= this.options.silenceMs) this.reset()
        continue
      }
      if (!manual && !this.chunks.length && !voiced) {
        this.pre.push(Buffer.from(frame)); if (this.pre.length > 10) this.pre.shift()
        continue
      }
      if (!this.chunks.length) { this.chunks = manual ? [] : this.pre; this.pre = []; this.frames = this.chunks.length }
      this.chunks.push(Buffer.from(frame)); this.frames++
      if (voiced) this.speechFrames++
      if (this.frames * 20 > this.options.maxRecordingSeconds * 1000) {
        this.reset(); this.discarding = true
        throw new Error('passport-recording-too-long')
      }
      if (this.speechFrames * 20 >= this.options.minSpeechMs) {
        this.captured?.(this.streaming ? frame : Buffer.concat(this.chunks), !this.streaming)
        this.streaming = true
      }
      if (!manual && this.quietFrames * 20 >= this.options.silenceMs) return this.commit()
    }
    return undefined
  }

  commit(): Buffer | undefined {
    const result = this.speechFrames * 20 >= this.options.minSpeechMs ? pcmWave(Buffer.concat(this.chunks)) : undefined
    if (!result && this.speechFrames) this.discarded?.('passport-speech-too-short')
    this.reset()
    return result
  }
}
