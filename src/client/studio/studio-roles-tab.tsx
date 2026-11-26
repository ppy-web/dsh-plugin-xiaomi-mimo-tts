import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiAddLine, RiCheckLine, RiDeleteBinLine, RiEditLine, RiErrorWarningLine, RiKey2Line, RiSearchLine, RiVolumeUpLine } from 'react-icons/ri'
import {
  BREEZE_TTS_MODEL,
  BREEZE_VOICE_PRESETS,
  DEEPSEEK_TTS_MODEL,
  DEEPSEEK_VOICES,
  DOUBAO_TTS_MODELS,
  DOUBAO_VOICE_PRESETS,
  STUDIO_ROLE_COLORS,
  TTS_MODELS,
  TTS_PROVIDERS,
  TTS_VOICES,
  pickStudioRoleColor,
} from '../../shared.js'
import type { StudioRole, StudioRoleInput, StudioRoleProvider } from '../../shared.js'
import { externalEngine } from '../engine-state.js'
import { hostRoute } from '../host-route.js'
import type { Translate } from '../localization.js'
import { LensSlider } from '../settings/controls/lens-slider.js'
import { VoiceAvatar } from '../settings/controls/voice-avatar.js'
import { VoiceReadingSelect } from '../settings/voice-reading-select.js'
import type { VoiceReadingSelectOption } from '../settings/voice-reading-select.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../shared.js'
import {
  readVoiceIdHistory,
  readVoiceIdNames,
  rememberVoiceId,
  subscribeVoiceIds,
  voiceIdRevision,
  writeVoiceIdHistory,
} from '../settings/voice-id-history.js'
import { studioClient, studioErrorMessage } from './studio-client-store.js'
import {
  CUSTOM_VOICE_DESIGN_OPTION,
  buildBreezeCustomVoiceChoices,
  buildBreezePresetChoices,
  buildDoubaoClonedVoiceChoices,
  buildDoubaoStandardCustomVoiceChoices,
  buildDoubaoStandardPresetChoices,
  buildXiaomiVoiceDesignChoices,
  findVoiceDesignPresetByPrompt,
  isBuiltinBreezeVoice,
  isBuiltinDoubaoVoice,
  resolveStudioRoleVoiceLabel,
} from './studio-voice-options.js'
import type { StudioRoleSettingsSlice, StudioVoiceChoice, StudioVoiceIdLibrary } from './studio-voice-options.js'
import { studioWorkspaceStore, useStudioWorkspaceState, type StudioRoleDraft } from './studio-workspace-store.js'
import { resolveStudioProviderAvailability, resolveStudioRoleAvailability } from './use-studio-provider-statuses.js'
import type { StudioProviderKeyMap } from './use-studio-provider-statuses.js'

const CUSTOM_VOICE_OPTION = '__studio_custom_voice__'

export interface StudioRolesTabProps {
  t: Translate
  roles: readonly StudioRole[]
  keyStatuses: StudioProviderKeyMap
  mossEnabled: boolean
  settings: StudioRoleSettingsSlice
  onSampleRole: (role: StudioRole) => void
  onError: (message: string) => void
}

type RoleDraft = StudioRoleDraft

const PROVIDER_DISPLAY: Record<string, string> = {
  xiaomi: 'Xiaomi MiMo',
  doubao: 'Doubao (豆包)',
  breeze: 'Breeze Blue',
  deepseek: 'DeepSeek',
  moss: 'MOSS-Nano (本地)',
}

function providerLabel(provider: StudioRoleProvider, external: ReturnType<typeof externalEngine>): string {
  return provider === external?.provider ? external.name : (PROVIDER_DISPLAY[provider] ?? provider)
}

function defaultModelFor(provider: StudioRoleProvider, externalModel?: string): string {
  if (provider === 'xiaomi') return 'mimo-v2.5-tts'
  if (provider === 'doubao') return 'seed-tts-2.0'
  if (provider === 'breeze') return BREEZE_TTS_MODEL
  if (provider === 'deepseek') return DEEPSEEK_TTS_MODEL
  if (provider === 'moss') return 'moss-tts-nano'
  return externalModel ?? ''
}

function defaultVoiceFor(provider: StudioRoleProvider, mossVoice: string, externalVoice?: string): string {
  if (provider === 'xiaomi') return TTS_VOICES[0]
  if (provider === 'doubao') return DOUBAO_VOICE_PRESETS[0]?.value ?? ''
  if (provider === 'breeze') return BREEZE_VOICE_PRESETS[0]?.value ?? ''
  if (provider === 'deepseek') return DEEPSEEK_VOICES[0]
  if (provider === 'moss') return mossVoice
  return externalVoice ?? ''
}

function firstAvailableProvider(keyStatuses: StudioProviderKeyMap, mossEnabled: boolean): StudioRoleProvider {
  for (const provider of TTS_PROVIDERS) {
    if (resolveStudioProviderAvailability(provider, keyStatuses, mossEnabled).available) return provider
  }
  if (mossEnabled) return 'moss'
  const ext = externalEngine()
  if (ext?.ready) return ext.provider
  return 'xiaomi'
}

export function StudioRolesTab({ t, roles, keyStatuses, mossEnabled, settings, onSampleRole, onError }: StudioRolesTabProps): ReactElement {
  const mossVoice = settings.mossVoice
  const external = externalEngine()
  const editing = useStudioWorkspaceState().roleDraft
  const setEditing = (next: RoleDraft | null): void => { studioWorkspaceStore.setRoleDraft(next) }
  const [voiceSource, setVoiceSource] = useState<'preset' | 'custom'>('preset')
  const [customVoiceMode, setCustomVoiceMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [providerFilter, setProviderFilter] = useState('')
  const [query, setQuery] = useState('')
  const [changingRoleIds, setChangingRoleIds] = useState(() => new Set<string>())
  const [error, setError] = useState<string | null>(null)
  const voiceDesignTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const customDesignPromptRef = useRef<string>('')
  const lastPresetVoiceRef = useRef<string>('')
  const voiceIdRev = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  const voiceIdLibrary = useMemo<StudioVoiceIdLibrary>(() => ({
    cloned: { history: readVoiceIdHistory('cloned'), names: readVoiceIdNames('cloned') },
    standard: { history: readVoiceIdHistory('standard'), names: readVoiceIdNames('standard') },
    breeze: { history: readVoiceIdHistory('breeze'), names: readVoiceIdNames('breeze') },
  }), [voiceIdRev])
  const roleCards = useMemo(() => roles.map(role => ({
    role,
    providerName: providerLabel(role.provider, external),
    voiceLabel: resolveStudioRoleVoiceLabel(role, voiceIdLibrary),
  })), [roles, external, voiceIdLibrary])
  const allProviders = { id: '', label: t('studio.roles.allProviders') }
  const providerNames = new Map(roleCards.map(({ role, providerName }) => [role.provider, providerName]))
  const filterOptions = [allProviders, ...Array.from(providerNames, ([id, label]) => ({ id, label }))]
  const selectedFilter = filterOptions.find(option => option.id === providerFilter) ?? allProviders
  const activeProvider = selectedFilter.id
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean)
  const visibleRoles = roleCards.filter(({ role, providerName, voiceLabel }) => {
    if (activeProvider && role.provider !== activeProvider) return false
    if (!terms.length) return true
    const text = [role.name, providerName, role.provider, voiceLabel, role.voice, role.model, role.speechInstruction]
      .join('\n').normalize('NFKC').toLowerCase()
    return terms.every(term => text.includes(term))
  })
  const voiceDesignChoices = useMemo(() => buildXiaomiVoiceDesignChoices(), [])
  const doubaoClonedChoices = useMemo(
    () => buildDoubaoClonedVoiceChoices(voiceIdLibrary, settings, roles),
    [voiceIdLibrary, settings, roles],
  )
  const doubaoStandardPresetChoices = useMemo(
    () => buildDoubaoStandardPresetChoices(voiceIdLibrary),
    [voiceIdLibrary],
  )
  const doubaoStandardCustomChoices = useMemo(
    () => buildDoubaoStandardCustomVoiceChoices(voiceIdLibrary, settings, roles),
    [voiceIdLibrary, settings, roles],
  )
  const breezePresetChoices = useMemo(
    () => buildBreezePresetChoices(voiceIdLibrary),
    [voiceIdLibrary],
  )
  const breezeCustomChoices = useMemo(
    () => buildBreezeCustomVoiceChoices(voiceIdLibrary, settings, roles),
    [voiceIdLibrary, settings, roles],
  )
  const voiceDesign = editing?.provider === 'xiaomi' && editing.model === 'mimo-v2.5-tts-voicedesign'
  const externalModels = editing?.provider === external?.provider ? external?.models : undefined
  const externalVoices = externalModels?.find(model => model.id === editing?.model)?.voices

  const providerOptions = useMemo<VoiceReadingSelectOption[]>(() => {
    const ids: StudioRoleProvider[] = [...TTS_PROVIDERS]
    if (mossEnabled || editing?.provider === 'moss') ids.push('moss')
    if (external) ids.push(external.provider)
    return ids.map(id => {
      const avail = resolveStudioProviderAvailability(id, keyStatuses, mossEnabled)
      const baseName = providerLabel(id, external)
      return {
        id,
        disabled: !avail.available,
        icon: !avail.available ? <RiErrorWarningLine size={14} className="xmimo-studio-key-warn-icon" aria-hidden="true" /> : undefined,
        label: avail.available ? baseName : (
          <span className="xmimo-studio-provider-option">
            <span>{baseName}</span>
            <span className="xmimo-studio-key-warn">{t(avail.reasonKey ?? 'studio.roles.apiKeyMissing')}</span>
          </span>
        ),
      }
    })
  }, [keyStatuses, mossEnabled, external, editing?.provider, t])

  const openNew = (): void => {
    setError(null)
    setVoiceSource('preset')
    setCustomVoiceMode(false)
    lastPresetVoiceRef.current = ''
    const provider = firstAvailableProvider(keyStatuses, mossEnabled)
    const extModel = external?.selection?.model ?? external?.models?.[0]?.id
    const extVoice = external?.selection?.voice ?? external?.models?.[0]?.voices[0]?.id
    setEditing({
      name: '',
      color: pickStudioRoleColor(roles.length),
      provider,
      model: defaultModelFor(provider, extModel),
      voice: defaultVoiceFor(provider, mossVoice, extVoice),
      voiceDesignPrompt: '',
      speechInstruction: '',
      voiceRate: 1,
    })
  }

  const openEdit = (role: StudioRole): void => {
    setError(null)
    setCustomVoiceMode(false)
    const initialCustom = (role.provider === 'breeze' && !isBuiltinBreezeVoice(role.voice))
      || (role.provider === 'doubao' && role.model === 'seed-tts-2.0' && !isBuiltinDoubaoVoice(role.voice))
    setVoiceSource(initialCustom ? 'custom' : 'preset')
    lastPresetVoiceRef.current = initialCustom ? '' : role.voice
    customDesignPromptRef.current = role.voiceDesignPrompt && !findVoiceDesignPresetByPrompt(role.voiceDesignPrompt)
      ? role.voiceDesignPrompt
      : ''
    setEditing({
      id: role.id,
      name: role.name,
      color: role.color,
      provider: role.provider,
      model: role.model,
      voice: role.voice,
      voiceDesignPrompt: role.voiceDesignPrompt ?? '',
      speechInstruction: role.speechInstruction ?? '',
      voiceRate: role.voiceRate,
    })
  }

  const changeProvider = (provider: StudioRoleProvider): void => {
    if (!editing) return
    setVoiceSource('preset')
    setCustomVoiceMode(false)
    lastPresetVoiceRef.current = ''
    const extModel = external?.selection?.model ?? external?.models?.[0]?.id
    const extVoice = external?.selection?.voice ?? external?.models?.[0]?.voices[0]?.id
    setEditing({
      ...editing,
      provider,
      model: defaultModelFor(provider, extModel),
      voice: defaultVoiceFor(provider, mossVoice, extVoice),
    })
  }

  const save = async (): Promise<void> => {
    if (!editing || !editing.name.trim()) return
    const trimmedVoice = editing.voice.trim()
    if (!voiceDesign && !trimmedVoice) return
    const avail = resolveStudioProviderAvailability(editing.provider, keyStatuses, mossEnabled)
    if (!avail.available) {
      setError(t('studio.roles.apiKeyMissingHint'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: StudioRoleInput = {
        ...(editing.id ? { id: editing.id } : {}),
        name: editing.name.trim(),
        color: editing.color,
        provider: editing.provider,
        model: editing.model,
        voice: trimmedVoice,
        ...(voiceDesign ? { voiceDesignPrompt: editing.voiceDesignPrompt.trim() } : {}),
        speechInstruction: editing.speechInstruction.trim(),
        voiceRate: editing.voiceRate,
      }
      await studioClient.saveRole(payload)
      if (trimmedVoice) {
        if (editing.provider === 'doubao' && editing.model === 'seed-icl-2.0') {
          writeVoiceIdHistory('cloned', rememberVoiceId(readVoiceIdHistory('cloned'), trimmedVoice))
        } else if (editing.provider === 'doubao' && (voiceSource === 'custom' || !isBuiltinDoubaoVoice(trimmedVoice))) {
          writeVoiceIdHistory('standard', rememberVoiceId(readVoiceIdHistory('standard'), trimmedVoice))
        } else if (editing.provider === 'breeze' && (voiceSource === 'custom' || !isBuiltinBreezeVoice(trimmedVoice))) {
          writeVoiceIdHistory('breeze', rememberVoiceId(readVoiceIdHistory('breeze'), trimmedVoice))
        }
      }
      setVoiceSource('preset')
      setCustomVoiceMode(false)
      setEditing(null)
    } catch (err) {
      setError(studioErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setConfirmDeleteId(null)
    try {
      await studioClient.deleteRole(id)
    } catch (err) {
      onError(studioErrorMessage(err, t))
    }
  }

  const toggleRole = async (role: StudioRole): Promise<void> => {
    if (changingRoleIds.has(role.id)) return
    setChangingRoleIds(current => new Set(current).add(role.id))
    try {
      await studioClient.setRoleEnabled(role.id, role.enabled === false)
    } catch {
      onError(t('studio.roles.updateStatusFailed'))
    } finally {
      setChangingRoleIds(current => {
        const next = new Set(current)
        next.delete(role.id)
        return next
      })
    }
  }

  const editingProviderAvail = editing
    ? resolveStudioProviderAvailability(editing.provider, keyStatuses, mossEnabled)
    : null

  const supportsVoiceSourceToggle = editing !== null && (
    editing.provider === 'breeze'
    || (editing.provider === 'doubao' && editing.model === 'seed-tts-2.0')
  )

  const activeVoiceSource: 'preset' | 'custom' = editing && supportsVoiceSourceToggle
    ? (voiceSource === 'custom'
      || (editing.voice.trim().length > 0 && (
        editing.provider === 'breeze'
          ? !isBuiltinBreezeVoice(editing.voice)
          : !isBuiltinDoubaoVoice(editing.voice)
      ))
      ? 'custom'
      : 'preset')
    : 'preset'

  const switchVoiceSource = (next: 'preset' | 'custom'): void => {
    if (!editing || next === activeVoiceSource) return
    setVoiceSource(next)
    setCustomVoiceMode(false)
    if (editing.provider === 'breeze') {
      if (next === 'custom') {
        if (isBuiltinBreezeVoice(editing.voice)) lastPresetVoiceRef.current = editing.voice
        setEditing({ ...editing, voice: breezeCustomChoices[0]?.id ?? '' })
      } else {
        const restored = isBuiltinBreezeVoice(lastPresetVoiceRef.current)
          ? lastPresetVoiceRef.current
          : (BREEZE_VOICE_PRESETS[0]?.value ?? '')
        setEditing({ ...editing, voice: restored })
      }
      return
    }
    if (editing.provider === 'doubao' && editing.model === 'seed-tts-2.0') {
      if (next === 'custom') {
        if (isBuiltinDoubaoVoice(editing.voice)) lastPresetVoiceRef.current = editing.voice
        setEditing({ ...editing, voice: doubaoStandardCustomChoices[0]?.id ?? '' })
      } else {
        const restored = isBuiltinDoubaoVoice(lastPresetVoiceRef.current)
          ? lastPresetVoiceRef.current
          : (DOUBAO_VOICE_PRESETS[0]?.value ?? '')
        setEditing({ ...editing, voice: restored })
      }
    }
  }

  const renderCustomVoiceField = (choices: readonly StudioVoiceChoice[], placeholder: string): ReactElement => {
    if (!editing) return <></>
    if (choices.length === 0) {
      return (
        <Input
          type="text"
          spellCheck={false}
          value={editing.voice}
          placeholder={placeholder}
          onChange={e => setEditing({ ...editing, voice: e.target.value })}
        />
      )
    }
    const inList = choices.some(item => item.id === editing.voice)
    const customInputActive = customVoiceMode || (!inList && editing.voice.trim().length > 0)
    return (
      <>
        <VoiceReadingSelect
          label={t('studio.roles.voice')}
          value={customInputActive ? CUSTOM_VOICE_OPTION : editing.voice}
          fallbackLabel={placeholder}
          options={[
            ...choices.map(v => ({ id: v.id, label: v.label })),
            { id: CUSTOM_VOICE_OPTION, label: t('studio.roles.customVoiceInput') },
          ]}
          disabled={false}
          align="start"
          className="xmimo-studio-select-pill"
          onSelect={next => {
            if (next === CUSTOM_VOICE_OPTION) {
              setCustomVoiceMode(true)
              setEditing({ ...editing, voice: inList ? '' : editing.voice })
            } else {
              setCustomVoiceMode(false)
              setEditing({ ...editing, voice: next })
            }
          }}
        />
        {customInputActive ? (
          <Input
            type="text"
            spellCheck={false}
            value={editing.voice}
            placeholder={placeholder}
            onChange={e => setEditing({ ...editing, voice: e.target.value })}
          />
        ) : null}
      </>
    )
  }

  const closeModal = (): void => {
    if (saving) return
    setError(null)
    setVoiceSource('preset')
    setCustomVoiceMode(false)
    setEditing(null)
  }

  return (
    <div className="xmimo-studio-panel">
      <div className="xmimo-studio-toolbar xmimo-studio-role-toolbar">
        <strong role="status">
          {t('studio.tab.roles')} · {activeProvider || terms.length ? `${visibleRoles.length}/${roles.length}` : roles.length}
        </strong>
        <div className="xmimo-studio-role-filters" role="search" aria-label={t('studio.roles.search')}>
          <VoiceReadingSelect
            label={`${t('studio.roles.filterProvider')} · ${selectedFilter.label}`}
            value={activeProvider}
            options={filterOptions}
            disabled={filterOptions.length === 1}
            buttonVariant="outline"
            align="start"
            className="xmimo-studio-role-provider-filter"
            onSelect={setProviderFilter}
          />
          <Input
            className="xmimo-studio-role-search"
            type="search"
            icon={<RiSearchLine size={15} aria-hidden="true" />}
            aria-label={t('studio.roles.search')}
            placeholder={t('studio.roles.search')}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openNew}>
          <RiAddLine size={15} aria-hidden="true" />
          <span>{t('studio.roles.new')}</span>
        </Button>
      </div>

      {editing ? (
        <Modal
          open
          title={editing.id ? t('studio.roles.edit') : t('studio.roles.new')}
          closeLabel={t('studio.roles.cancel')}
          onClose={closeModal}
          className="xmimo-ui-scope xmimo-studio-role-modal"
          contentClassName="xmimo-studio-role-modal-content"
          footer={
            <>
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={closeModal}>
                {t('studio.roles.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={saving || !editing.name.trim() || (voiceDesign ? !editing.voiceDesignPrompt.trim() : !editing.voice.trim()) || !editingProviderAvail?.available}
                onClick={() => { void save() }}
              >
                {t('studio.roles.save')}
              </Button>
            </>
          }
        >
          <div className="xmimo-studio-role-modal-form">
            <div className="xmimo-studio-field-grid">
              <div className="xmimo-studio-field">
                <label>{t('studio.roles.name')}</label>
                <Input
                  type="text"
                  maxLength={32}
                  data-modal-autofocus=""
                  value={editing.name}
                  placeholder={t('studio.roles.namePlaceholder')}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                />
              </div>

            <div className="xmimo-studio-field">
              <label>{t('studio.roles.provider')}</label>
              <VoiceReadingSelect
                label={t('studio.roles.provider')}
                value={editing.provider}
                options={providerOptions}
                disabled={false}
                align="start"
                className="xmimo-studio-select-pill"
                onSelect={id => changeProvider(id as StudioRoleProvider)}
              />
            </div>

            {editing.provider === 'xiaomi' || editing.provider === 'doubao' || externalModels?.length ? (
              <div className="xmimo-studio-field">
                <label>{t('studio.roles.model')}</label>
                <VoiceReadingSelect
                  label={t('studio.roles.model')}
                  value={editing.model}
                  options={externalModels?.map(model => ({ id: model.id, label: model.name }))
                    ?? (editing.provider === 'xiaomi' ? TTS_MODELS.filter(m => m !== 'browser-local-fallback') : DOUBAO_TTS_MODELS)
                      .map(model => ({ id: model, label: model }))}
                  disabled={false}
                  align="start"
                  className="xmimo-studio-select-pill"
                  onSelect={model => {
                    if (model === editing.model) return
                    setVoiceSource('preset')
                    setCustomVoiceMode(false)
                    let voice = editing.voice
                    let voiceDesignPrompt = editing.voiceDesignPrompt
                    if (externalModels) voice = externalModels.find(item => item.id === model)?.voices[0]?.id ?? ''
                    else if (editing.provider === 'doubao') {
                      voice = model === 'seed-icl-2.0'
                        ? (doubaoClonedChoices[0]?.id ?? '')
                        : defaultVoiceFor('doubao', mossVoice)
                    } else if (editing.provider === 'xiaomi' && model === 'mimo-v2.5-tts-voicedesign' && !voiceDesignPrompt.trim()) {
                      voiceDesignPrompt = settings.voiceDesignPrompt.trim() || voiceDesignChoices[0]?.prompt || ''
                    }
                    setEditing({ ...editing, model, voice, voiceDesignPrompt })
                  }}
                />
              </div>
            ) : null}

            {supportsVoiceSourceToggle ? (
              <div className="xmimo-studio-field">
                <label>{t('studio.roles.voiceSource')}</label>
                <VoiceReadingSelect
                  label={t('studio.roles.voiceSource')}
                  value={activeVoiceSource}
                  options={[
                    { id: 'preset', label: t('studio.roles.voiceSourcePreset') },
                    { id: 'custom', label: t('studio.roles.voiceSourceCustom') },
                  ]}
                  disabled={false}
                  align="start"
                  className="xmimo-studio-select-pill"
                  onSelect={next => switchVoiceSource(next as 'preset' | 'custom')}
                />
              </div>
            ) : null}

            {voiceDesign ? (() => {
              const matchedPreset = findVoiceDesignPresetByPrompt(editing.voiceDesignPrompt)
              return (
                <div className="xmimo-studio-field">
                  <label>{t('studio.roles.voiceDesignPreset')}</label>
                  <VoiceReadingSelect
                    label={t('studio.roles.voiceDesignPreset')}
                    value={matchedPreset ? matchedPreset.id : CUSTOM_VOICE_DESIGN_OPTION}
                    options={[
                      ...voiceDesignChoices.map(choice => ({ id: choice.id, label: choice.label })),
                      { id: CUSTOM_VOICE_DESIGN_OPTION, label: t('studio.roles.voiceDesignCustom') },
                    ]}
                    disabled={false}
                    align="start"
                    className="xmimo-studio-select-pill"
                    onSelect={next => {
                      if (next === CUSTOM_VOICE_DESIGN_OPTION) {
                        const restored = customDesignPromptRef.current
                          || (!findVoiceDesignPresetByPrompt(settings.voiceDesignCustomPrompt) ? settings.voiceDesignCustomPrompt.trim() : '')
                        setEditing({ ...editing, voiceDesignPrompt: matchedPreset ? restored : editing.voiceDesignPrompt })
                        requestAnimationFrame(() => voiceDesignTextareaRef.current?.focus())
                        return
                      }
                      const chosen = voiceDesignChoices.find(choice => choice.id === next)
                      if (!chosen) return
                      if (!matchedPreset && editing.voiceDesignPrompt.trim()) {
                        customDesignPromptRef.current = editing.voiceDesignPrompt
                      }
                      setEditing({ ...editing, voiceDesignPrompt: chosen.prompt })
                    }}
                  />
                </div>
              )
            })() : <div className="xmimo-studio-field">
              <label>{t('studio.roles.voice')}</label>
              {externalVoices?.length ? (
                <VoiceReadingSelect
                  label={t('studio.roles.voice')}
                  value={editing.voice}
                  options={externalVoices.map(voice => ({ id: voice.id, label: voice.name }))}
                  disabled={false}
                  align="start"
                  className="xmimo-studio-select-pill"
                  onSelect={voice => setEditing({ ...editing, voice })}
                />
              ) : editing.provider === 'xiaomi' ? (
                <VoiceReadingSelect
                  label={t('studio.roles.voice')}
                  value={editing.voice}
                  options={TTS_VOICES.map(voice => ({ id: voice, label: voice }))}
                  disabled={false}
                  align="start"
                  className="xmimo-studio-select-pill"
                  onSelect={voice => setEditing({ ...editing, voice })}
                />
              ) : editing.provider === 'deepseek' ? (
                <VoiceReadingSelect
                  label={t('studio.roles.voice')}
                  value={editing.voice}
                  options={DEEPSEEK_VOICES.map(voice => ({ id: voice, label: voice }))}
                  disabled={false}
                  align="start"
                  className="xmimo-studio-select-pill"
                  onSelect={voice => setEditing({ ...editing, voice })}
                />
              ) : editing.provider === 'breeze' ? (
                activeVoiceSource === 'custom'
                  ? renderCustomVoiceField(breezeCustomChoices, t('settings.breezeVoiceHint'))
                  : (
                    <VoiceReadingSelect
                      label={t('studio.roles.voice')}
                      value={editing.voice}
                      options={breezePresetChoices.map(v => ({ id: v.id, label: v.label }))}
                      disabled={false}
                      align="start"
                      className="xmimo-studio-select-pill"
                      onSelect={voice => setEditing({ ...editing, voice })}
                    />
                  )
              ) : editing.provider === 'doubao' && editing.model === 'seed-tts-2.0' ? (
                activeVoiceSource === 'custom'
                  ? renderCustomVoiceField(doubaoStandardCustomChoices, t('settings.doubaoVoiceId'))
                  : (
                    <VoiceReadingSelect
                      label={t('studio.roles.voice')}
                      value={editing.voice}
                      options={doubaoStandardPresetChoices.map(v => ({ id: v.id, label: v.label }))}
                      disabled={false}
                      align="start"
                      className="xmimo-studio-select-pill"
                      onSelect={voice => setEditing({ ...editing, voice })}
                    />
                  )
              ) : editing.provider === 'doubao' && editing.model === 'seed-icl-2.0' ? (
                renderCustomVoiceField(doubaoClonedChoices, t('settings.doubaoClonedVoice'))
              ) : (
                <Input
                  type="text"
                  spellCheck={false}
                  value={editing.voice}
                  onChange={e => setEditing({ ...editing, voice: e.target.value })}
                />
              )}
            </div>}

            <div className="xmimo-studio-field">
              <label>{t('studio.roles.voiceRate')} ({editing.voiceRate.toFixed(1)}×)</label>
              <LensSlider
                label={t('studio.roles.voiceRate')}
                min={0.5}
                max={2}
                step={0.1}
                center={1}
                value={editing.voiceRate}
                formatValue={v => `${v.toFixed(1)}×`}
                disabled={false}
                onChange={next => setEditing({ ...editing, voiceRate: next })}
              />
            </div>

            <div className="xmimo-studio-field">
              <label>{t('studio.roles.color')}</label>
              <div className="xmimo-studio-colors">
                {STUDIO_ROLE_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className="xmimo-studio-color-dot"
                    style={{ background: color }}
                    aria-label={color}
                    aria-pressed={editing.color === color}
                    onClick={() => setEditing({ ...editing, color })}
                  />
                ))}
              </div>
            </div>
          </div>

          {voiceDesign ? (
            <div className="xmimo-studio-field">
              <label htmlFor="xmimo-studio-role-voice-design">{t('studio.roles.voiceDesignPrompt')}</label>
              <textarea
                ref={voiceDesignTextareaRef}
                id="xmimo-studio-role-voice-design"
                className="xmimo-studio-textarea"
                required
                rows={2}
                maxLength={500}
                value={editing.voiceDesignPrompt}
                onChange={e => {
                  const next = e.target.value
                  if (!findVoiceDesignPresetByPrompt(next)) customDesignPromptRef.current = next
                  setEditing({ ...editing, voiceDesignPrompt: next })
                }}
              />
            </div>
          ) : null}

          <div className="xmimo-studio-field">
            <label>{t('studio.roles.instruction')}</label>
            <Input
              type="text"
              maxLength={300}
              value={editing.speechInstruction}
              placeholder={t('studio.roles.instructionPlaceholder')}
              onChange={e => setEditing({ ...editing, speechInstruction: e.target.value })}
            />
          </div>

            {editingProviderAvail && !editingProviderAvail.available ? (
              <div className="xmimo-studio-key-warn" role="status">
                <RiKey2Line size={13} aria-hidden="true" />
                <span>{t('studio.roles.apiKeyMissingHint')}</span>
              </div>
            ) : null}

            {error ? <p className="xmimo-tts-failed" role="alert">{error}</p> : null}
          </div>
        </Modal>
      ) : null}

      <div className="xmimo-studio-role-viewport">
        {visibleRoles.length === 0 ? (
          <div className="xmimo-studio-empty-page">
            <img src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={136} height={136} alt="" aria-hidden="true" />
            <p>{t(roles.length ? 'studio.roles.noMatches' : 'studio.roles.empty')}</p>
            {roles.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setProviderFilter('')
                  setQuery('')
                }}
              >
                <span>{t('studio.scripts.clearSearch')}</span>
              </Button>
            ) : (
              <Button type="button" variant="primary" size="sm" onClick={openNew}>
                <RiAddLine size={15} aria-hidden="true" />
                <span>{t('studio.roles.new')}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="xmimo-studio-role-grid">
            {visibleRoles.map(({ role, providerName, voiceLabel }) => {
              const avail = resolveStudioRoleAvailability(role, keyStatuses, mossEnabled)
              const enabled = role.enabled !== false
              const toggleLabel = t(enabled ? 'studio.roles.disable' : 'studio.roles.enable')
              const matchedDesignPreset = role.provider === 'xiaomi' && role.model === 'mimo-v2.5-tts-voicedesign'
                ? findVoiceDesignPresetByPrompt(role.voiceDesignPrompt)
                : undefined
              const avatarVoice = matchedDesignPreset
                ? { provider: 'xiaomi-design', id: matchedDesignPreset.id }
                : {
                    provider: role.provider,
                    id: role.model === 'mimo-v2.5-tts-voicedesign' ? (role.voiceDesignPrompt || role.id) : (role.voice || role.id),
                    model: role.model,
                  }
              return (
                <div
                  key={role.id}
                  className="xmimo-studio-role-card"
                  data-disabled={enabled && !avail.available ? 'true' : undefined}
                  data-inactive={!enabled ? 'true' : undefined}
                  style={{ '--role-color': role.color } as CSSProperties}
                >
                  <VoiceAvatar
                    voice={avatarVoice}
                    label={role.name}
                  />
                  <div className="xmimo-studio-role-body">
                    <div className="xmimo-studio-role-head">
                      <div className="xmimo-studio-role-title">
                        <strong title={role.name}>{role.name}</strong>
                        {role.builtin ? <span className="xmimo-studio-builtin-tag">{t('studio.roles.builtinTag')}</span> : null}
                      </div>
                      <div className="xmimo-studio-role-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="xmimo-studio-icon-btn"
                          disabled={!avail.available}
                          aria-label={t('studio.roles.testListen')}
                          title={!avail.available ? t(avail.reasonKey ?? 'studio.roles.apiKeyMissing') : t('studio.roles.testListen')}
                          onClick={() => onSampleRole(role)}
                        >
                          <RiVolumeUpLine size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="xmimo-studio-icon-btn"
                          title={t('studio.roles.edit')}
                          onClick={() => openEdit(role)}
                        >
                          <RiEditLine size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant={confirmDeleteId === role.id ? 'outline' : 'ghost'}
                          size="sm"
                          className="xmimo-studio-icon-btn xmimo-danger-action"
                          title={t(confirmDeleteId === role.id ? 'studio.roles.confirmDelete' : 'studio.roles.delete')}
                          onBlur={() => setConfirmDeleteId(cur => (cur === role.id ? null : cur))}
                          onClick={() => { void remove(role.id) }}
                        >
                          {confirmDeleteId === role.id ? <RiCheckLine size={14} aria-hidden="true" /> : <RiDeleteBinLine size={14} aria-hidden="true" />}
                        </Button>
                      </div>
                    </div>
                    <div className="xmimo-studio-role-meta">
                      <span>{providerName}</span>
                      <span className="xmimo-studio-role-voice" title={role.voice || role.model}>{voiceLabel}</span>
                      <span>{role.voiceRate.toFixed(1)}×</span>
                      {!enabled ? <span className="xmimo-studio-role-status">{t('studio.roles.disabled')}</span> : !avail.available ? (
                        <span className="xmimo-studio-key-warn" title={t('studio.roles.apiKeyMissingHint')}>
                          <RiKey2Line size={12} aria-hidden="true" />
                          <span>{t(avail.reasonKey ?? 'studio.roles.apiKeyMissing')}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="xmimo-studio-role-footer">
                      {role.speechInstruction ? <small className="xmimo-split-bar-desc xmimo-studio-role-desc" title={role.speechInstruction}>{role.speechInstruction}</small> : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`${toggleLabel} ${role.name}`}
                        disabled={changingRoleIds.has(role.id)}
                        onClick={() => { void toggleRole(role) }}
                      >
                        {toggleLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
