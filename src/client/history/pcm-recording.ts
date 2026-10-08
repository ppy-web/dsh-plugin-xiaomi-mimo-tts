import type { AudioHistory, AudioHistoryInput } from './audio-history.js'

/** Collect original PCM16 bytes before volume/rate processing and wrap them in a playable WAV. */
export class PcmRecording {
  private chunks: Uint8Array<ArrayBuffer>[] = []
  private bytes = 0
  private overflow = false
  private readonly maxBytes: number

  constructor(maxBytes = 100 * 1024 * 1024 - 44) { this.maxBytes = maxBytes }

  append(base64: string): void {
    if (this.overflow) return
    const binary = atob(base64)
    this.bytes += binary.length
    if (this.bytes > this.maxBytes) {
      this.overflow = true
      this.chunks = []
      return
    }
    this.chunks.push(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
  }

  toWav(): Blob | null {
    if (this.overflow || this.bytes === 0 || this.bytes % 2 !== 0) return null
    const header = new ArrayBuffer(44)
    const view = new DataView(header)
    const label = (offset: number, value: string): void => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
    }
    label(0, 'RIFF')
    view.setUint32(4, 36 + this.bytes, true)
    label(8, 'WAVE')
    label(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 24000, true)
    view.setUint32(28, 48000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    label(36, 'data')
    view.setUint32(40, this.bytes, true)
    return new Blob([header, ...this.chunks], { type: 'audio/wav' })
  }

  save(history: AudioHistory | undefined, input: Omit<AudioHistoryInput, 'blob' | 'format'>): void {
    if (this.overflow) void history?.reportSkipped()
    const blob = this.toWav()
    this.chunks = []
    this.bytes = 0
    if (blob !== null) void history?.add({ ...input, blob, format: 'wav' })
  }
}
