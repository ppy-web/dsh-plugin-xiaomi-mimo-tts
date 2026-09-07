/**
 * Composer dictation button registered at `conversation.input.right`.
 *
 * Three states: idle mic → recording (click again or the 120-second ceiling
 * stops the capture and starts one transcription) → transcribing (spinner,
 * not repeatable). The transcription stream fills the composer draft through
 * `AsrDraftWriter`'s plugin-last-write protection and never auto-sends.
 *
 * While recording, a two-layer glow (rotating blue-purple-red gradient plus a
 * red radial halo) follows the smoothed input level via GSAP quickTo;
 * `prefers-reduced-motion` keeps a static red ring instead.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { AsrDraftWriter } from '../asr-core.js'
import { streamAsrTranscription } from '../asr-stream.js'
import type { TtsSettings } from '../shared.js'
import { resolveTtsSettings } from '../shared.js'
import { AsrRecorder } from './asr-recorder.js'
import type { SettingsScopeCompat } from './dsh-compat.js'
import type { Translate } from './localization.js'
import { useSettingsSnapshot } from './settings-scope.js'

type AsrButtonState = 'idle' | 'recording' | 'transcribing'

interface AsrDictationButtonProps {
  useInput: <T>(selector: (snapshot: { readonly draft: string; readonly draftRev: number }) => T) => T
  inputActions: { setDraft(text: string): void }
  settings: SettingsScopeCompat<TtsSettings>
  t: Translate
}

function MicIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  )
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Compact control to the left of the composer submit action. */
export function AsrDictationButton({ useInput, inputActions, settings, t }: AsrDictationButtonProps): ReactElement | null {
  const settingsSnapshot = useSettingsSnapshot(settings)
  const asrEnabled = resolveTtsSettings(settingsSnapshot.value).asrEnabled
  const [state, setState] = useState<AsrButtonState>('idle')
  const [status, setStatus] = useState<string | null>(null)
  const recorderRef = useRef<AsrRecorder | null>(null)
  const writerRef = useRef<AsrDraftWriter | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const levelSinkRef = useRef<((level: number) => void) | null>(null)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const glowRef = useRef<HTMLSpanElement | null>(null)
  const haloRef = useRef<HTMLSpanElement | null>(null)
  const reducedMotionRef = useRef(prefersReducedMotion())

  const draft = useInput((input) => input.draft)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => () => {
    // Session switch or unmount: release capture, stop streaming, never call ASR.
    recorderRef.current?.dispose()
    writerRef.current?.dispose()
    requestRef.current?.abort()
  }, [])

  useGSAP(() => {
    const glow = glowRef.current
    const halo = haloRef.current
    if (state !== 'recording' || glow === null || halo === null || reducedMotionRef.current) return
    gsap.set(glow, { opacity: 0.3 })
    gsap.set(halo, { opacity: 0.3, scale: 1.04 })
    const rotate = gsap.to(glow, { rotation: '+=360', duration: 6, ease: 'none', repeat: -1 })
    const toScale = gsap.quickTo(halo, 'scale', { duration: 0.28, ease: 'power2.out' })
    const toOpacity = gsap.quickTo(halo, 'opacity', { duration: 0.28, ease: 'power2.out' })
    // Gentle breathing while quiet; voice activity takes over the same tweens.
    const breathe = gsap.to(halo, { scale: 1.14, opacity: 0.5, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    const applyLevel = (level: number): void => {
      const clamped = Math.min(1, Math.max(0, level))
      if (clamped > 0.02) breathe.pause()
      else breathe.resume()
      toScale(1.04 + clamped * 0.28)
      toOpacity(0.3 + clamped * 0.55)
    }
    levelSinkRef.current = applyLevel
    return () => {
      levelSinkRef.current = null
      rotate.kill()
      breathe.kill()
    }
  }, { dependencies: [state], scope: rootRef })

  if (!asrEnabled || settingsSnapshot.status === 'unavailable') return null

  const transcribing = state === 'transcribing'

  const transcribe = async (recorder: AsrRecorder): Promise<void> => {
    setState('transcribing')
    setStatus(null)
    const controller = new AbortController()
    requestRef.current = controller
    const writer = new AsrDraftWriter({
      getDraft: () => draftRef.current,
      setDraft: (text) => inputActions.setDraft(text),
    })
    writerRef.current = writer
    try {
      const wav = await recorder.stop()
      if (wav === null) {
        setStatus(t('asr.error.empty'))
        return
      }
      const text = await streamAsrTranscription(wav, controller.signal, (fullText) => writer.setText(fullText))
      if (text.length === 0) setStatus(t('asr.error.empty'))
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : ''
      setStatus(message.startsWith('api-key')
        ? t('asr.error.apiKey')
        : message === 'xiaomi-timeout' || message === 'timeout'
          ? t('asr.error.timeout')
          : t('asr.error.request'))
    } finally {
      if (controller.signal.aborted) writer.dispose()
      else {
        writer.flush(true)
        writer.dispose()
      }
      writerRef.current = null
      requestRef.current = null
      recorderRef.current = null
      setState('idle')
    }
  }

  const toggle = (): void => {
    if (transcribing) return
    if (state === 'recording') {
      const recorder = recorderRef.current
      if (recorder === null) return
      recorderRef.current = null
      void transcribe(recorder)
      return
    }
    setStatus(null)
    const recorder = new AsrRecorder()
    recorderRef.current = recorder
    setState('recording')
    void recorder.start({
      onLevel: (level) => levelSinkRef.current?.(level),
      onLimit: () => {
        if (recorderRef.current !== recorder) return
        recorderRef.current = null
        void transcribe(recorder)
      },
    }).catch((error: unknown) => {
      if (recorderRef.current !== recorder) return
      recorderRef.current = null
      setState('idle')
      const code = (error as { code?: unknown } | null)?.code
      setStatus(code === 'permission'
        ? t('asr.error.permission')
        : code === 'unsupported' || code === 'worklet'
          ? t('asr.error.unsupported')
          : t('asr.error.device'))
    })
  }

  const label = state === 'recording'
    ? t('asr.stop')
    : transcribing
      ? t('asr.transcribing')
      : t('asr.start')
  const tooltip = status ?? label

  return (
    <span className={state === 'recording' ? 'xmimo-asr-root xmimo-asr-root-recording' : 'xmimo-asr-root'} ref={rootRef}>
      <span ref={glowRef} className="xmimo-asr-glow" aria-hidden="true" />
      <span ref={haloRef} className="xmimo-asr-halo" aria-hidden="true" />
      <Tooltip label={tooltip} side="bottom">
        <button
          type="button"
          className={state === 'recording'
            ? 'xmimo-asr-button xmimo-asr-button-recording'
            : transcribing
              ? 'xmimo-asr-button xmimo-asr-button-busy'
              : 'xmimo-asr-button'}
          aria-label={label}
          aria-pressed={state === 'recording'}
          aria-busy={transcribing}
          disabled={transcribing}
          onClick={toggle}
        >
          {transcribing ? <span className="xmimo-asr-spinner" aria-hidden="true" /> : <MicIcon />}
        </button>
      </Tooltip>
      {status !== null || state !== 'idle'
        ? <span className="xmimo-asr-live-status" role="status">{tooltip}</span>
        : null}
    </span>
  )
}
