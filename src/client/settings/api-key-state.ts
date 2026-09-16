export type ApiKeyStatus = 'loading' | 'missing' | 'recognized' | 'unrecognized' | 'unavailable'
export type ApiKeyViewState = ApiKeyStatus | 'pending-save' | 'pending-invalid' | 'pending-clear'

/** Resolve the user-facing API-key state without exposing the saved secret to the browser. */
export function resolveApiKeyViewState(
  draft: string,
  draftRecognized: boolean,
  savedStatus: ApiKeyStatus,
  change: 'set' | 'clear' | undefined,
): ApiKeyViewState {
  if (change === 'clear') return 'pending-clear'
  if (change === 'set' && draft.trim().length > 0) {
    return draftRecognized ? 'pending-save' : 'pending-invalid'
  }
  return savedStatus
}
