/** Console tracing enabled only by the dedicated debug build. */
export const debugConsole: Pick<Console, 'info' | 'warn' | 'error'> | undefined =
  process.env.MIMO_TTS_DEBUG === 'true' ? console : undefined
