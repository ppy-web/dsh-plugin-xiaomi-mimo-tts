/**
 * Browser-side availability of the Voice Design AI assistant.
 *
 * DSH 0.1.5+ cannot mount a third-party `connection.rpc.handle()` channel: the
 * route is resolved through the connection plugin's own context, which stopped
 * injecting `webServer`. The plugin still loads and every other route keeps
 * working, so the only symptom is a 405 on the channel itself. The assistant is
 * hidden rather than rendered as a button that cannot succeed.
 */
export type VoiceDesignAiAvailability = 'checking' | 'available' | 'unavailable'

/** Read the Host status payload; anything but an explicit `true` is unavailable. */
export function resolveVoiceDesignAiAvailability(status: unknown): VoiceDesignAiAvailability {
  if (status === null || typeof status !== 'object') return 'unavailable'
  return (status as { available?: unknown }).available === true ? 'available' : 'unavailable'
}

/**
 * Whether a `connection.rpc.call` transport failure means the channel was never
 * mounted. The caller-thrown message is
 * `transport failure for <channel>/<endpoint>: HTTP <status>`.
 */
export function isUnmountedChannelFailure(message: unknown): boolean {
  return typeof message === 'string' && /HTTP 405\b/u.test(message)
}
