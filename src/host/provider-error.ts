const errorBrand = Symbol.for('dsh-xiaomi-tts.provider-error')

export class TtsProviderError extends Error {
  private readonly [errorBrand] = true
  // The public API and Host are separate bundles; errors must retain identity across both.
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && (value as unknown as Record<symbol, unknown>)[errorBrand] === true
  }
  constructor(readonly code: string, message = code, readonly status = 502, readonly upstreamCode?: string, readonly requestId?: string) {
    super(message)
  }
}

/** Upstream messages can echo credentials; only expose a bounded, redacted diagnostic. */
export function safeProviderError(error: unknown, secrets: string[] = []): { error: string; message: string; upstreamCode?: string; requestId?: string } {
  const known = error instanceof TtsProviderError
  const redact = (text: string): string => {
    for (const secret of secrets) {
      if (secret.trim()) text = text.split(secret.trim()).join('[redacted]')
    }
    return text.replace(/(?:Bearer\s+\S+|(?:X-Api-Key|authorization)\s*[:=]\s*\S+)/giu, '[redacted]')
  }
  const message = redact(known ? error.message : 'Speech synthesis failed.').slice(0, 500)
  return {
    error: known ? error.code : 'doubao-request-failed', message,
    ...(known && error.upstreamCode !== undefined ? { upstreamCode: redact(error.upstreamCode).slice(0, 80) } : {}),
    ...(known && error.requestId !== undefined ? { requestId: redact(error.requestId).slice(0, 128) } : {}),
  }
}
