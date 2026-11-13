export const pcmEvent = () => new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: 'AAA=' } } }] })}\n\n`)

export async function withBrowserPlayback(run, options = {}) {
  const keys = ['fetch', 'AudioContext', 'window', 'SpeechSynthesisUtterance', 'Audio']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const createUrl = URL.createObjectURL
  const revokeUrl = URL.revokeObjectURL
  const state = { contexts: [], utterances: [], media: [], requests: [], revoked: [], created: [], cancelled: 0 }
  globalThis.AudioContext = class {
    state = 'running'
    currentTime = 0
    destination = {}
    sources = []
    constructor() { state.contexts.push(this) }
    createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
    createBuffer(channels, length, sampleRate) { return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) } }
    createBufferSource() {
      const source = new EventTarget()
      source.playbackRate = { value: 1 }
      source.connect = () => {}
      source.disconnect = () => {}
      source.addEventListener('ended', () => { source.finished = true }, { once: true })
      source.start = time => { source.startTime = time; if (options.endPcm) queueMicrotask(() => source.dispatchEvent(new Event('ended'))) }
      source.stop = () => source.dispatchEvent(new Event('ended'))
      this.sources.push(source)
      return source
    }
    advanceTo(time) {
      if (this.state !== 'running') return
      this.currentTime = time
      const due = this.sources.filter(source => !source.finished && source.startTime !== undefined
        && source.startTime + source.buffer.duration / source.playbackRate.value <= time)
        .sort((a, b) => (a.startTime + a.buffer.duration / a.playbackRate.value) - (b.startTime + b.buffer.duration / b.playbackRate.value))
      for (const source of due) if (!source.finished) source.dispatchEvent(new Event('ended'))
    }
    async suspend() { if (this.suspendResult) await this.suspendResult; this.state = 'suspended' }
    async resume() { if (this.resumeResult) await this.resumeResult; this.state = 'running' }
    async close() { this.state = 'closed' }
  }
  const speech = {
    getVoices: () => options.voices === false ? [] : [{ voiceURI: 'zh', lang: 'zh-CN', default: true }],
    speak(utterance) {
      state.utterances.push(utterance)
      if (options.startLocal) queueMicrotask(() => utterance.onstart?.())
    },
    cancel() { state.cancelled += 1 }, pause() {}, resume() {},
  }
  globalThis.window = { speechSynthesis: speech, setTimeout, clearTimeout }
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  globalThis.Audio = class extends EventTarget {
    paused = true
    listeners = new Set()
    constructor(url) { super(); this.src = url; state.media.push(this) }
    addEventListener(type, listener, options) { this.listeners.add(listener); super.addEventListener(type, listener, options) }
    removeEventListener(type, listener) { this.listeners.delete(listener); super.removeEventListener(type, listener) }
    async play() { if (this.playError) throw this.playError; this.paused = false }
    pause() { this.paused = true }
    removeAttribute(name) { if (name === 'src') this.src = '' }
    load() {}
  }
  URL.createObjectURL = () => { const url = `blob:review-${state.created.length}`; state.created.push(url); return url }
  URL.revokeObjectURL = url => state.revoked.push(url)
  globalThis.fetch = async (url, init) => {
    const request = { url, ...JSON.parse(init.body), signal: init.signal }
    state.requests.push(request)
    return options.fetch ? options.fetch(request, state) : new Response(pcmEvent())
  }
  try { await run(state) } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = revokeUrl
  }
}
