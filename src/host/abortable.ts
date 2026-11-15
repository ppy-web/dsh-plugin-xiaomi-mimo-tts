import { TtsProviderError } from './provider-error.js'

/** Abort even when an adapter ignores cancellation, while observing its eventual rejection. */
export function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason ?? new TtsProviderError('tts-canceled', undefined, 499))
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}
