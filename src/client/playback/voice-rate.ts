export function applyMediaVoiceRate(media: Pick<HTMLMediaElement, 'playbackRate' | 'preservesPitch'>, voiceRate: number): void {
  media.playbackRate = voiceRate
  media.preservesPitch = true
}

export function applyPcmVoiceRate(source: Pick<AudioBufferSourceNode, 'playbackRate'>, voiceRate: number): void {
  source.playbackRate.value = voiceRate
}

export function applySpeechVoiceRate(utterance: Pick<SpeechSynthesisUtterance, 'rate'>, voiceRate: number): void {
  utterance.rate = voiceRate
}

export function pcmPlaybackDuration(duration: number, voiceRate: number): number {
  return duration / voiceRate
}
