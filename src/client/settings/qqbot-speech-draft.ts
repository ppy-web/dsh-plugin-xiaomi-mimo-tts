import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TtsSettings } from '../../types/settings.js'

export interface QqSpeechDraft { qqbotEnabled: boolean; qqbotMaxAutoCharacters: number; qqbotMaxDurationSeconds: number }
export function validQqSpeechDraft(value: QqSpeechDraft): boolean {
  return typeof value.qqbotEnabled === 'boolean'
    && Number.isInteger(value.qqbotMaxAutoCharacters) && value.qqbotMaxAutoCharacters >= 0 && value.qqbotMaxAutoCharacters <= 12000
    && Number.isInteger(value.qqbotMaxDurationSeconds) && value.qqbotMaxDurationSeconds >= 0 && value.qqbotMaxDurationSeconds <= 6000
}
export async function saveQqSpeechDraft(scope: ConfigForm<TtsSettings>, base: QqSpeechDraft, value: QqSpeechDraft, revision: number): Promise<void> {
  const snapshot = scope.getSnapshot()
  if (!validQqSpeechDraft(value) || snapshot.status !== 'ready' || !snapshot.writable || snapshot.revision !== revision) throw new Error('qqbot-settings-conflict')
  const ops = (Object.keys(base) as Array<keyof QqSpeechDraft>).filter(field => base[field] !== value[field])
    .map(field => ({ op: 'set' as const, path: [field], value: value[field] }))
  if (ops.length && !await scope.mutate(ops, revision)) throw new Error('qqbot-settings-save-failed')
}
