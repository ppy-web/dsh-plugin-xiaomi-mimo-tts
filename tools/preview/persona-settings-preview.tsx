import { useState } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_WHALE_SETTINGS, type WhaleSettings } from '../../src/types/whale.js'
import { WhalePersonaSettings } from '../../src/client/settings/whale-settings.js'
import { QqbotSpeechSettings } from '../../src/client/settings/qqbot-settings.js'
import { en, zh, type Translate } from '../../src/client/localization.js'
import { PreviewSettingsScope } from './mock-settings.js'

function personaScope(): ConfigForm<WhaleSettings> {
  let value = structuredClone(DEFAULT_WHALE_SETTINGS)
  let revision = 1
  const listeners = new Set<() => void>()
  const base = structuredClone(DEFAULT_WHALE_SETTINGS)
  let snapshot: ConfigFormSnapshot<WhaleSettings> = { status: 'ready', value, base, user: {}, writable: true, revision }
  const scope: ConfigForm<WhaleSettings> = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async set(field, next) { return scope.mutate([{ op: 'set', path: [field], value: next }]) },
    async unset(field) { return scope.mutate([{ op: 'unset', path: [field] }]) },
    async mutate(ops, expectedRevision) {
      if (expectedRevision !== undefined && expectedRevision !== revision) return false
      const next = structuredClone(value) as unknown as Record<string, unknown>
      for (const op of ops) {
        const [group, field] = op.path
        if (!group) continue
        const target = field ? next[group] as Record<string, unknown> : next
        const key = field ?? group
        if (op.op === 'set') target[key] = op.value
        else target[key] = field ? (base[group as keyof WhaleSettings] as unknown as Record<string, unknown>)[field] : base[group as keyof WhaleSettings]
      }
      value = next as unknown as WhaleSettings
      snapshot = { status: 'ready', value, base, user: value, writable: true, revision: ++revision }
      for (const listener of listeners) listener()
      return true
    },
  }
  return scope
}

export function PersonaSettingsPreview({ locale }: { locale: 'zh' | 'en' }) {
  const [desktop] = useState(personaScope)
  const [qq] = useState(personaScope)
  const [speech] = useState(() => new PreviewSettingsScope())
  const t: Translate = key => (locale === 'zh' ? zh : en)[key]
  return <div>
    <details>
      <summary>{locale === 'zh' ? 'DSH 鲸鱼娘配置' : 'DSH Whale Girl settings'}</summary>
      <WhalePersonaSettings view="page" scope={desktop} t={t} />
    </details>
    <details>
      <summary>{locale === 'zh' ? 'QQ Bot 传声筒配置' : 'QQ Bot Megaphone settings'}</summary>
      <QqbotSpeechSettings view="page" scope={speech} personaScope={qq} t={t} />
    </details>
  </div>
}
