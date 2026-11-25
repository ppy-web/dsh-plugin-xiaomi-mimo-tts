import { TtsProviderError } from './provider-error.js'

export interface DecodedWavMono {
  sampleRate: number
  samples: Int16Array
}

export interface WavStitchSegmentInput {
  wav: Buffer
  pauseAfterMs: number
  /** Optional playback speed factor (0.5..2.0) when upstream did not apply voiceRate. */
  speed?: number
}

export interface WavStitchTimelineEntry {
  startMs: number
  endMs: number
  speechDurationMs: number
}

export interface WavStitchResult {
  wav: Buffer
  sampleRate: number
  durationMs: number
  timeline: WavStitchTimelineEntry[]
}

function clampInt16(value: number): number {
  if (value >= 32767) return 32767
  if (value <= -32768) return -32768
  return Math.round(value)
}

/** Decode PCM 8/16/24/32-bit or IEEE Float32 WAV buffers into mono signed 16-bit PCM. */
export function decodeWavMono16(buffer: Buffer): DecodedWavMono {
  if (buffer.byteLength < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new TtsProviderError('invalid-audio-format', 'Expected a RIFF WAVE buffer.')
  }
  if (buffer.readUInt32LE(4) + 8 > buffer.length) throw new TtsProviderError('invalid-audio-format', 'Truncated WAV file.')

  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  const dataChunks: Buffer[] = []

  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const bodyStart = offset + 8
    const bodyEnd = bodyStart + chunkSize
    if (bodyEnd > buffer.length) throw new TtsProviderError('invalid-audio-format', 'Truncated WAV chunk.')

    if (chunkId === 'fmt ') {
      if (bodyEnd - bodyStart < 16) throw new TtsProviderError('invalid-audio-format', 'Truncated WAV fmt chunk.')
      const rawFormat = buffer.readUInt16LE(bodyStart)
      channels = buffer.readUInt16LE(bodyStart + 2)
      sampleRate = buffer.readUInt32LE(bodyStart + 4)
      bitsPerSample = buffer.readUInt16LE(bodyStart + 14)
      if (rawFormat === 0xfffe && bodyEnd - bodyStart >= 40) {
        audioFormat = buffer.readUInt16LE(bodyStart + 24)
      } else {
        audioFormat = rawFormat
      }
    } else if (chunkId === 'data') {
      if (bodyEnd > bodyStart) dataChunks.push(buffer.subarray(bodyStart, bodyEnd))
    }

    offset = bodyStart + chunkSize + (chunkSize % 2)
  }

  if ((audioFormat !== 1 && audioFormat !== 3) || channels < 1 || channels > 8 || sampleRate < 4000 || sampleRate > 192000) {
    throw new TtsProviderError('invalid-audio-format', 'Unsupported WAV encoding parameters.')
  }
  const bytesPerSample = bitsPerSample / 8
  if (![1, 2, 3, 4].includes(bytesPerSample) || (audioFormat === 3 && bytesPerSample !== 4)) {
    throw new TtsProviderError('invalid-audio-format', 'Unsupported WAV bit depth.')
  }

  const rawData = dataChunks.length === 1 ? dataChunks[0]! : Buffer.concat(dataChunks)
  const frameBytes = bytesPerSample * channels
  if (rawData.length % frameBytes !== 0) throw new TtsProviderError('invalid-audio-format', 'Incomplete WAV samples.')
  const frameCount = Math.floor(rawData.byteLength / frameBytes)
  if (frameCount <= 0) throw new TtsProviderError('invalid-audio-format', 'WAV data chunk is empty.')

  const samples = new Int16Array(frameCount)
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0
    const base = frame * frameBytes
    for (let ch = 0; ch < channels; ch += 1) {
      const pos = base + ch * bytesPerSample
      let sample = 0
      if (audioFormat === 3) {
        sample = rawData.readFloatLE(pos) * 32767
      } else if (bytesPerSample === 1) {
        sample = (rawData.readUInt8(pos) - 128) * 256
      } else if (bytesPerSample === 2) {
        sample = rawData.readInt16LE(pos)
      } else if (bytesPerSample === 3) {
        const b0 = rawData[pos]!
        const b1 = rawData[pos + 1]!
        const b2 = rawData[pos + 2]!
        const int24 = (b0 | (b1 << 8) | (b2 << 16)) << 8 >> 8
        sample = int24 / 256
      } else {
        sample = rawData.readInt32LE(pos) / 65536
      }
      sum += sample
    }
    samples[frame] = clampInt16(sum / channels)
  }

  return { sampleRate, samples }
}

/** Resample mono PCM16 using linear interpolation when sample rates differ. */
export function resamplePcm16(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || samples.length === 0) return samples
  const targetLength = Math.max(1, Math.round(samples.length * toRate / fromRate))
  const out = new Int16Array(targetLength)
  const ratio = fromRate / toRate
  const last = samples.length - 1
  for (let i = 0; i < targetLength; i += 1) {
    const srcPos = i * ratio
    const left = Math.min(last, Math.floor(srcPos))
    const right = Math.min(last, left + 1)
    const frac = srcPos - left
    out[i] = clampInt16(samples[left]! * (1 - frac) + samples[right]! * frac)
  }
  return out
}

/** Pitch-preserving WSOLA time-stretcher for mono PCM16 (speed 0.5..2.0). */
export function stretchPcm16(samples: Int16Array, sampleRate: number, speed: number): Int16Array {
  const rate = Math.min(2, Math.max(0.5, speed))
  if (!Number.isFinite(rate) || Math.abs(rate - 1) < 0.02) return samples
  const windowSize = Math.max(64, Math.round(sampleRate * 0.02) & ~1)
  const halfWindow = windowSize >> 1
  const searchRadius = Math.max(16, Math.round(sampleRate * 0.006))
  if (samples.length < windowSize * 2) return samples

  const outLength = Math.max(windowSize, Math.round(samples.length / rate))
  const acc = new Float32Array(outLength + windowSize)
  const norm = new Float32Array(outLength + windowSize)
  const hann = new Float32Array(windowSize)
  for (let i = 0; i < windowSize; i += 1) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)))
  }

  let outPos = 0
  let expectedInPos = 0
  let actualInPos = 0

  while (outPos + windowSize <= acc.length && expectedInPos < samples.length - halfWindow) {
    let bestOffset = Math.min(Math.max(0, Math.round(expectedInPos)), samples.length - windowSize)
    if (outPos > 0) {
      const naturalNext = actualInPos + halfWindow
      if (naturalNext + halfWindow <= samples.length) {
        const minCandidate = Math.max(0, Math.round(expectedInPos) - searchRadius)
        const maxCandidate = Math.min(samples.length - windowSize, Math.round(expectedInPos) + searchRadius)
        let bestScore = -Infinity
        const step = Math.max(1, Math.floor(halfWindow / 32))
        for (let candidate = minCandidate; candidate <= maxCandidate; candidate += 2) {
          let corr = 0
          for (let k = 0; k < halfWindow; k += step) {
            corr += samples[naturalNext + k]! * samples[candidate + k]!
          }
          if (corr > bestScore) {
            bestScore = corr
            bestOffset = candidate
          }
        }
      }
    }

    for (let i = 0; i < windowSize; i += 1) {
      const w = hann[i]!
      acc[outPos + i]! += samples[bestOffset + i]! * w
      norm[outPos + i]! += w
    }

    actualInPos = bestOffset
    outPos += halfWindow
    expectedInPos += halfWindow * rate
  }

  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const weight = norm[i]!
    out[i] = weight > 1e-4 ? clampInt16(acc[i]! / weight) : 0
  }
  return out
}

export function encodeWavMono16(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2
  const buffer = Buffer.allocUnsafe(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i]!, 44 + i * 2)
  }
  return buffer
}

/** Normalize all line WAVs to a shared PCM16 mono rate, insert pauses, and emit exact timestamps. */
export function stitchWavSegments(segments: readonly WavStitchSegmentInput[]): WavStitchResult {
  if (segments.length === 0) throw new TtsProviderError('text-required', 'At least one audio segment is required.', 400)

  const decoded = segments.map(segment => ({
    ...decodeWavMono16(segment.wav),
    pauseAfterMs: Math.max(0, Math.round(segment.pauseAfterMs)),
    speed: segment.speed,
  }))

  const targetRate = Math.min(48000, Math.max(16000, ...decoded.map(item => item.sampleRate)))
  const prepared = decoded.map(item => {
    const resampled = resamplePcm16(item.samples, item.sampleRate, targetRate)
    const stretched = item.speed !== undefined ? stretchPcm16(resampled, targetRate, item.speed) : resampled
    const pauseSamples = Math.max(0, Math.round((targetRate * item.pauseAfterMs) / 1000))
    return { samples: stretched, pauseSamples }
  })

  const totalSamples = prepared.reduce((sum, item) => sum + item.samples.length + item.pauseSamples, 0)
  const merged = new Int16Array(Math.max(1, totalSamples))
  const timeline: WavStitchTimelineEntry[] = []

  let cursor = 0
  for (const item of prepared) {
    const startMs = Math.round((cursor / targetRate) * 1000)
    merged.set(item.samples, cursor)
    cursor += item.samples.length
    const speechEndMs = Math.round((cursor / targetRate) * 1000)
    cursor += item.pauseSamples
    const endMs = Math.round((cursor / targetRate) * 1000)
    timeline.push({
      startMs,
      endMs,
      speechDurationMs: Math.max(0, speechEndMs - startMs),
    })
  }

  return {
    wav: encodeWavMono16(merged, targetRate),
    sampleRate: targetRate,
    durationMs: Math.round((cursor / targetRate) * 1000),
    timeline,
  }
}
