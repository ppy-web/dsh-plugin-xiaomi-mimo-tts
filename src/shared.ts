// Re-export everything from the new modular structure for backward compatibility
export * from './constants.js'
export * from './types/index.js'
export * from './text/index.js'
export * from './utils/index.js'
export * from './doubao-voices.js'
export * from './moss.js'

// Export commonly used items at the top level for convenience
export { TTS_SETTINGS_NAMESPACE } from './constants.js'
export { prepareTtsText, splitCompletedTtsSentences } from './text/index.js'
export { prepareBreezeTtsText, splitBreezeTtsSegments } from './text/index.js'
export { resolveTtsSettings } from './utils/index.js'
