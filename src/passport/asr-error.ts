export function recognitionError(status: number, code = ''): Error {
  return new Error(status === 402 || /quota|balance|credit|额度|余额/iu.test(code) ? 'passport-asr-quota-exceeded'
    : status === 401 ? 'passport-asr-auth-failed'
    : status === 403 ? 'passport-asr-permission-denied'
      : status === 429 ? 'passport-asr-rate-limited' : 'passport-recognition-failed')
}

/** Numeric ASR codes are distinct from the TTS protocol; prose is classified but never forwarded. */
export function doubaoRecognitionError(code: number, detail = ''): Error {
  if (code === 45000002 || code === 20000003) return new Error('passport-no-speech')
  if (code === 45000081 || code === 55001010) return new Error('passport-asr-timeout')
  if (code === 45000151 || code === 45000001) return new Error('passport-asr-invalid-response')
  if (/quota|balance|credit|额度|余额/iu.test(detail)) return recognitionError(402)
  if (/unauthori|invalid.*key|auth|鉴权|密钥/iu.test(detail)) return recognitionError(401)
  if (/permission|resource|not.*open|权限|未开通/iu.test(detail)) return recognitionError(403)
  if (/rate|concurr|限流|并发/iu.test(detail)) return recognitionError(429)
  return new Error('passport-recognition-failed')
}
