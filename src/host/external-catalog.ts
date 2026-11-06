import type { ExternalSpeechModel, ExternalSpeechSelection, ExternalSpeechProviderSnapshot } from '../host-api.js'
import { TtsProviderError } from './provider-error.js'

const invalid = (): never => { throw new TtsProviderError('external-provider-invalid', undefined, 400) }
function label(value: unknown, maximum = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) return invalid()
  return value.trim()
}
function entries(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value) || value.length > 2000) return invalid()
  const rows = value.map(item => ({ id: label(item?.id), name: label(item?.name) }))
  if (new Set(rows.map(item => item.id)).size !== rows.length) return invalid()
  return rows
}

/** Allowlist every public field. Adapter URLs and arbitrary config never enter the browser state. */
export function externalCatalog(value: ExternalSpeechProviderSnapshot): Pick<ExternalSpeechProviderSnapshot, 'models' | 'selection' | 'managementPath' | 'managementBundle' | 'configurationId' | 'configurations'> {
  const result: ReturnType<typeof externalCatalog> = {}
  if (value.models !== undefined) {
    if (!Array.isArray(value.models) || value.models.length > 200) return invalid()
    const models: ExternalSpeechModel[] = value.models.map(model => ({
      id: label(model.id), name: label(model.name), voices: entries(model.voices),
      streaming: model.streaming === true, speechInstruction: model.speechInstruction === true,
      ...(model.instructions === undefined ? {} : { instructions: entries(model.instructions) }),
      ...(model.audioTags === undefined ? {} : { audioTags: entries(model.audioTags.map(tag => ({ id: tag.value, name: tag.name }))).map(tag => ({ value: tag.id, name: tag.name })) }),
    }))
    if (new Set(models.map(model => model.id)).size !== models.length) return invalid()
    result.models = models
  }
  if (value.selection !== undefined) {
    result.selection = { model: label(value.selection.model), voice: label(value.selection.voice),
      ...(value.selection.speechInstruction === undefined ? {} : { speechInstruction: value.selection.speechInstruction }) }
    validateExternalSelection(result.selection, result.models)
  }
  if (typeof value.managementPath === 'string' && /^\/plugins\/[a-z0-9][a-z0-9/_-]*$/u.test(value.managementPath) && value.managementPath.length < 200) result.managementPath = value.managementPath
  if (typeof value.managementBundle === 'string' && value.managementBundle.length < 200 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value.managementBundle)) result.managementBundle = value.managementBundle
  if (value.configurationId !== undefined) result.configurationId = label(value.configurationId)
  if (value.configurations !== undefined) {
    if (!Array.isArray(value.configurations) || value.configurations.length > 200) return invalid()
    result.configurations = entries(value.configurations)
    if (result.configurationId !== undefined && !result.configurations.some(item => item.id === result.configurationId)) return invalid()
  }
  return result
}

export function validateExternalSelection(selection: ExternalSpeechSelection, models?: ExternalSpeechModel[]): void {
  const model = models?.find(item => item.id === selection.model)
  if (!model || !model.voices.some(item => item.id === selection.voice)) throw new TtsProviderError('external-selection-invalid', undefined, 400)
  const instruction = selection.speechInstruction
  if (instruction !== undefined && (typeof instruction !== 'string' || instruction.length > 4096)) throw new TtsProviderError('external-selection-invalid', undefined, 400)
  if (instruction && (!model.speechInstruction || (model.instructions && !model.instructions.some(item => item.id === instruction)))) throw new TtsProviderError('external-option-unsupported', undefined, 400)
}

export function externalRequestOptions(request: { model?: string; voice?: string; speechInstruction?: string }, state: ExternalSpeechProviderSnapshot): Partial<ExternalSpeechSelection> {
  if (request.model === undefined && request.voice === undefined && request.speechInstruction === undefined) return {}
  if (!state.selection || !state.models) throw new TtsProviderError('external-option-unsupported', undefined, 400)
  const selection = { ...state.selection, ...Object.fromEntries(Object.entries(request).filter(([key, value]) => ['model', 'voice', 'speechInstruction'].includes(key) && value !== undefined)) }
  validateExternalSelection(selection, state.models)
  return selection
}
