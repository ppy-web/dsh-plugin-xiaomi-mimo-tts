export function createMockTextToSpeech({
  id = 'deepseek-tts',
  voices = ['stella', 'tide'],
  phase = 'ready',
  sampleRate = 24000,
  maxCharacters = 5000,
  pcm = Buffer.alloc(4800, 1),
  onSynthesize,
} = {}) {
  const calls = []
  let currentPhase = phase
  let currentVoices = voices
  const listeners = new Set()
  return {
    calls,
    setPhase(nextPhase) {
      currentPhase = nextPhase
      for (const listener of listeners) listener()
    },
    snapshot() {
      return {
        selected: id,
        providers: [{
          id,
          name: 'DeepSeek',
          location: 'cloud',
          audio: { encoding: 'pcm-s16le', sampleRate },
          maxCharacters,
          voices: currentVoices,
          availability: currentPhase === 'ready'
            ? { phase: 'ready' }
            : currentPhase === 'unavailable'
              ? { phase: 'unavailable', reason: 'sign-in-required' }
              : { phase: 'failed', message: 'host failed' },
          voice: currentVoices[0],
        }],
      }
    },
    resolve({ text, voice }) {
      const chosen = voice ?? currentVoices[0]
      if (!currentVoices.includes(chosen)) throw new Error(`Unsupported voice: ${chosen}`)
      if (text.length > maxCharacters) throw new Error(`Text too long: ${text.length}`)
      return { provider: { info: { id } }, text, voice: chosen }
    },
    async *synthesize(spec, signal) {
      calls.push({ text: spec.text, voice: spec.voice })
      if (onSynthesize) {
        yield* onSynthesize(spec, signal)
        return
      }
      signal.throwIfAborted()
      yield pcm.subarray(0, 1)
      if (pcm.length > 1) yield pcm.subarray(1)
    },
    async *follow(signal) {
      let stale = true
      let wake = () => {}
      const listener = () => { stale = true; wake() }
      listeners.add(listener)
      signal.addEventListener('abort', listener, { once: true })
      try {
        while (!signal.aborted) {
          if (!stale) await new Promise(resolve => { wake = resolve })
          if (signal.aborted) return
          stale = false
          yield this.snapshot()
        }
      } finally {
        listeners.delete(listener)
        signal.removeEventListener('abort', listener)
      }
    },
  }
}
