import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { DEFAULT_MOSS_BASE_URL, mossVoiceChoices } from '../../shared.js'
import type { MossVoice, TtsLocalSpeechMode, TtsLocalVoiceEngine } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { LocaleKey } from '../localization.js'
import { MossRequestError, probeMossService } from '../moss-service.js'
import type { MossProbeSuccess } from '../moss-service.js'
import { MOSS_DEPLOY_PROMPT } from './moss-deploy-prompt.js'
import { LocalVoicePicker } from './controls/local-voice-picker.js'
import { VoicePresetPicker } from './controls/built-in-voice-picker.js'
import type { VoicePickerPreset } from './controls/built-in-voice-picker.js'
import { SettingFieldHeading } from './field-heading.js'
import type { EditableSettingField, SettingField } from './types.js'

type ProbeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: MossProbeSuccess }
  | { status: 'error'; code: string; message: string }

export interface LocalVoiceModuleProps {
  t: Translate
  minimal: boolean
  writable: boolean
  localSpeechMode: TtsLocalSpeechMode
  engine: TtsLocalVoiceEngine
  browserVoiceURI: string
  mossBaseURL: string
  mossVoice: string
  mossVoiceName: string
  fieldOverridden: (field: SettingField) => boolean
  resetField: (field: EditableSettingField) => void
  onEngineChange: (engine: TtsLocalVoiceEngine) => void
  onBrowserVoiceChange: (voiceURI: string) => void
  onMossBaseURLChange: (baseURL: string) => void
  onMossVoiceChange: (voiceId: string, voiceName: string) => void
  onBrowserAvailabilityChange: (available: boolean) => void
}

function errorKey(code: string): LocaleKey {
  if (code === 'moss-invalid-url') return 'settings.mossInvalidUrl'
  if (code === 'moss-timeout') return 'settings.mossTimeout'
  if (code === 'moss-unreachable' || code === 'moss-request-failed') return 'settings.mossUnreachable'
  return 'settings.mossProbeFailed'
}

function voicePresets(voices: readonly MossVoice[], t: Translate): VoicePickerPreset[] {
  return voices.map(voice => ({
    id: voice.id,
    value: voice.id,
    label: voice.name,
    summary: `${voice.id} · ${t('settings.mossBuiltInVoice')}`,
    avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-local-voice-avatar xmimo-tts-moss-voice-avatar" aria-hidden="true">M</span>,
  }))
}

/** Clipboard API first, then the legacy selection fallback for restricted frames. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the selection path.
  }
  if (typeof document === 'undefined') return false
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}

export function LocalVoiceModule({
  t, minimal, writable, localSpeechMode, engine, browserVoiceURI,
  mossBaseURL, mossVoice, mossVoiceName,
  fieldOverridden, resetField, onEngineChange, onBrowserVoiceChange,
  onMossBaseURLChange, onMossVoiceChange, onBrowserAvailabilityChange,
}: LocalVoiceModuleProps): ReactElement {
  const [probe, setProbe] = useState<ProbeState>({ status: 'idle' })
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const probeAbort = useRef<AbortController | null>(null)
  const copyTimer = useRef<number | null>(null)
  const mossVoiceRef = useRef(mossVoice)
  mossVoiceRef.current = mossVoice
  const disabled = !writable || localSpeechMode === 'disabled'
  const voices = probe.status === 'ready' ? probe.result.voices : []
  const choices = mossVoiceChoices(voices, mossVoice, mossVoiceName)
  const presets = voicePresets(choices, t)
  const selected = presets.find(preset => preset.value === mossVoice) ?? presets[0]
  const activeReset: EditableSettingField = engine === 'moss' ? 'mossVoice' : 'localVoiceURI'
  const activeField: SettingField = activeReset

  useEffect(() => () => {
    probeAbort.current?.abort()
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
  }, [])

  useEffect(() => {
    probeAbort.current?.abort()
    probeAbort.current = null
    setProbe({ status: 'idle' })
  }, [mossBaseURL])

  const copyDeployPrompt = useCallback(async (): Promise<void> => {
    const copied = await copyText(MOSS_DEPLOY_PROMPT)
    setCopyState(copied ? 'copied' : 'failed')
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => {
      setCopyState('idle')
      copyTimer.current = null
    }, 2000)
  }, [])

  const probeService = useCallback(async (): Promise<void> => {
    probeAbort.current?.abort()
    const controller = new AbortController()
    probeAbort.current = controller
    setProbe({ status: 'loading' })
    try {
      const result = await probeMossService(mossBaseURL, controller.signal)
      if (controller.signal.aborted) return
      if (!result.ok) {
        setProbe({ status: 'error', code: result.error, message: result.message })
        return
      }
      setProbe({ status: 'ready', result })
      if (writable && result.voices.length > 0 && !result.voices.some(voice => voice.id === mossVoiceRef.current)) {
        const first = result.voices[0]!
        onMossVoiceChange(first.id, first.name)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setProbe({
        status: 'error',
        code: error instanceof MossRequestError ? error.code : 'moss-request-failed',
        message: error instanceof Error ? error.message : '',
      })
    }
  }, [mossBaseURL, onMossVoiceChange, writable])

  useEffect(() => {
    if (engine !== 'moss') return () => {}
    void probeService()
    // Probe once when the MOSS tab becomes active; later attempts are explicit.
    return () => {
      probeAbort.current?.abort()
      probeAbort.current = null
    }
  }, [engine]) // eslint-disable-line react-hooks/exhaustive-deps

  const probeText = probe.status === 'loading'
    ? t('settings.mossProbing')
    : probe.status === 'ready'
      ? probe.result.warmup !== null && !probe.result.warmup.ready
        ? `${t('settings.mossWarming')} ${Math.round(probe.result.warmup.progress * 100)}%`
        : t('settings.mossOnlineReady')
      : probe.status === 'error'
        ? t(errorKey(probe.code))
        : t('settings.mossNotProbed')
  const probeState = probe.status === 'ready' ? 'online' : probe.status === 'error' ? 'offline' : probe.status

  return <div className="xmimo-tts-voice xmimo-tts-local-voice">
    <SettingFieldHeading
      label={t('settings.localVoice')}
      overriddenLabel={t('settings.overridden')}
      resetLabel={t('settings.reset')}
      overridden={fieldOverridden(activeField)}
      resettable
      disabled={!writable}
      onReset={() => {
        resetField(activeReset)
        if (activeReset === 'mossVoice') resetField('mossVoiceName')
      }}
      suffix={<small className="xmimo-tts-hint xmimo-tts-local-voice-engine-note" style={{ fontSize: '11px' }}>{engine === 'moss' ? 'MOSS' : 'Microsoft Edge – Better'}</small>}
    />
    <div className="xmimo-tts-local-voice-tabs" data-xmimo-select-option="true">
      <SegmentedControl
        id="xmimo-tts-local-voice-engine"
        value={engine}
        options={[
          { value: 'browser', label: t('settings.localVoiceEngineBrowser') },
          { value: 'moss', label: t('settings.localVoiceEngineMoss') },
        ]}
        label={t('settings.localVoiceEngine')}
        disabled={!writable || localSpeechMode === 'disabled'}
        onChange={onEngineChange}
        className="xmimo-tts-settings-segmented xmimo-tts-local-voice-segmented"
      />
    </div>
    {engine === 'browser' ? <LocalVoicePicker
      value={browserVoiceURI}
      disabled={disabled}
      label={t('settings.localVoice')}
      minimal={minimal}
      loadingLabel={t('settings.localVoiceLoading')}
      unavailableLabel={t('settings.localVoiceUnavailable')}
      offlineLabel={t('settings.localVoiceOffline')}
      onlineLabel={t('settings.localVoiceOnline')}
      onChange={onBrowserVoiceChange}
      onAvailabilityChange={onBrowserAvailabilityChange}
    /> : <div className="xmimo-tts-moss-local">
      <div className="xmimo-tts-moss-field">
        <div className="xmimo-tts-moss-field-heading">
          <span className="xmimo-tts-moss-field-title">{t('settings.mossBaseURL')}</span>
          <button
            type="button"
            className="xmimo-tts-moss-text-button"
            disabled={probe.status === 'loading'}
            onClick={() => { void probeService() }}
          >{probe.status === 'loading' ? t('settings.mossProbingShort') : t('settings.mossProbe')}</button>
          <button
            type="button"
            className="xmimo-tts-moss-deploy-hint"
            data-state={copyState}
            title={t('settings.mossCopyDeployHint')}
            aria-label={t('settings.mossCopyDeployHint')}
            onClick={() => { void copyDeployPrompt() }}
          >{copyState === 'copied'
            ? t('settings.mossDeployCopied')
            : copyState === 'failed'
              ? t('settings.mossDeployCopyFailed')
              : <>
                <span>{t('settings.mossDeployHintBefore')}</span>
                <span className="xmimo-tts-moss-deploy-action">{t('settings.mossDeployHintAction')}</span>
                <span>{t('settings.mossDeployHintAfter')}</span>
              </>}</button>
        </div>
        <input
          type="url"
          className="xmimo-tts-moss-baseurl"
          value={mossBaseURL}
          spellCheck={false}
          disabled={!writable}
          aria-label={t('settings.mossBaseURL')}
          placeholder={DEFAULT_MOSS_BASE_URL}
          onChange={(event) => { onMossBaseURLChange(event.target.value) }}
        />
      </div>
      <div className="xmimo-tts-moss-status" data-state={probeState} role="status" title={probe.status === 'error' ? probe.message : undefined}>
        <span aria-hidden="true" className="xmimo-tts-moss-status-dot" />
        <span>{probeText}</span>
        {probe.status === 'ready' && probe.result.health.device !== undefined ? <small>{probe.result.health.device}</small> : null}
      </div>
      {selected === undefined
        ? <button type="button" className="xmimo-tts-builtin-voice-trigger xmimo-tts-moss-voice-placeholder" disabled>{t('settings.mossVoiceProbeFirst')}</button>
        : <VoicePresetPicker
          value={mossVoice}
          disabled={disabled}
          label={t('settings.mossVoice')}
          minimal={minimal}
          presets={presets}
          onChange={(value) => {
            const voice = choices.find(item => item.id === value)
            if (voice !== undefined) onMossVoiceChange(voice.id, voice.name)
          }}
        />}
      {localSpeechMode !== 'local-first' ? <small className="xmimo-tts-hint">{t(localSpeechMode === 'disabled' ? 'settings.mossLocalDisabledHint' : 'settings.mossLocalFirstHint')}</small> : null}
    </div>}
  </div>
}
