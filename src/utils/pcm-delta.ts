/** Decode a PCM SSE data event, preserving provider errors. */
export function pcmDeltaFromSse(data: string): string | null {
  if (data === '[DONE]') return null
  const value = JSON.parse(data) as {
    choices?: Array<{ delta?: { audio?: { data?: unknown } } }>
    error?: string | { message?: string }
  }
  const upstreamError = typeof value.error === 'string' ? value.error : value.error?.message
  if (upstreamError !== undefined) throw new Error(upstreamError)
  const pcm = value.choices?.[0]?.delta?.audio?.data
  return typeof pcm === 'string' && pcm.length > 0 ? pcm : null
}
