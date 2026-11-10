export function recognitionError(status: number, code = ''): Error {
  return Object.assign(new Error(status === 402 || /quota|balance|credit|额度|余额/iu.test(code) ? 'passport-asr-quota-exceeded'
    : status === 401 ? 'passport-asr-auth-failed'
    : status === 403 ? 'passport-asr-permission-denied'
      : status === 429 ? 'passport-asr-rate-limited' : 'passport-recognition-failed'), { upstreamStatus: status })
}

/** Numeric ASR codes are distinct from the TTS protocol; prose is classified but never forwarded. */
export function doubaoRecognitionError(code: number, detail = ''): Error {
  const message = code === 45000002 || code === 20000003 ? 'passport-no-speech'
    : code === 45000081 || code === 55001010 ? 'passport-asr-timeout'
      : code === 45000151 || code === 45000001 ? 'passport-asr-invalid-response'
        : /quota|balance|credit|额度|余额/iu.test(detail) ? 'passport-asr-quota-exceeded'
          : /unauthori|invalid.*key|auth|鉴权|密钥/iu.test(detail) ? 'passport-asr-auth-failed'
            : /permission|resource|not.*open|权限|未开通/iu.test(detail) ? 'passport-asr-permission-denied'
              : /rate|concurr|限流|并发/iu.test(detail) ? 'passport-asr-rate-limited' : 'passport-recognition-failed'
  return Object.assign(new Error(message), { upstreamCode: code })
}
