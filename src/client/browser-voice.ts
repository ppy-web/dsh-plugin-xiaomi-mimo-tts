export function selectBrowserVoice(voices: readonly SpeechSynthesisVoice[], value: string): SpeechSynthesisVoice | undefined {
  const language = typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN'
  return voices.find((voice) => voice.voiceURI === value)
    ?? voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase().split('-')[0] ?? 'zh'))
    ?? voices.find((voice) => voice.default)
    ?? voices[0]
}

export function browserVoice(value: string): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || window.speechSynthesis === undefined) return undefined
  return selectBrowserVoice(window.speechSynthesis.getVoices(), value)
}
