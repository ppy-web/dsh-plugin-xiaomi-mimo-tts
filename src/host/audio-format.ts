/** Identify an audio envelope without asserting that the complete file is valid. */
export function hasWavHeader(audio: Buffer): boolean {
  return audio.length >= 12 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE'
}

export function hasMp3Header(audio: Buffer): boolean {
  return audio.length >= 2 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0))
}
