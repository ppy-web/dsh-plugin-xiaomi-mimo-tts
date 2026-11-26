import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StudioLine } from '../../shared.js'
import type { Translate } from '../localization.js'
import { VoiceReadingSelect } from '../settings/voice-reading-select.js'
import type { VoiceReadingSelectOption } from '../settings/voice-reading-select.js'

interface StudioCastReplacementProps {
  t: Translate
  lines: readonly StudioLine[]
  roles: readonly VoiceReadingSelectOption[]
  disabled: boolean
  onReplace: (fromId: string, toId: string) => void
}

export function StudioCastReplacement({ t, lines, roles, disabled, onReplace }: StudioCastReplacementProps): ReactElement | null {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const cast = useMemo(() => {
    const byId = new Map(roles.map(role => [role.id, role]))
    const members = new Map<string, { option: VoiceReadingSelectOption; count: number }>()
    for (const [index, line] of lines.entries()) {
      const member = members.get(line.roleId)
      if (member) member.count += 1
      else members.set(line.roleId, {
        option: byId.get(line.roleId) ?? { id: line.roleId, label: `${t('studio.error.missingRole')} · #${index + 1}` },
        count: 1,
      })
    }
    return members
  }, [lines, roles, t])

  const enabledRoles = roles.filter(role => !role.disabled)
  if (!cast.size || !enabledRoles.some(role => cast.size > 1 || !cast.has(role.id))) return null

  const sources = Array.from(cast.values(), member => ({ ...member.option, disabled: false }))
  const source = cast.get(fromId) ?? (cast.size === 1 ? cast.get(sources[0]!.id) : undefined)
  const targets = enabledRoles.filter(role => role.id !== source?.option.id)
  const target = targets.find(role => role.id === toId)

  return (
    <div className="xmimo-studio-cast-replacement" role="group" aria-label={t('studio.scripts.replaceRole')}>
      <span>{t('studio.scripts.replaceRole')}</span>
      <VoiceReadingSelect
        label={t('studio.scripts.replaceFrom')}
        value={source?.option.id ?? ''}
        fallbackLabel={t('studio.scripts.replaceFrom')}
        options={sources}
        disabled={disabled}
        buttonVariant="outline"
        className="xmimo-studio-cast-select"
        align="start"
        onSelect={id => {
          setFromId(id)
          setToId('')
        }}
      />
      <VoiceReadingSelect
        label={t('studio.scripts.replaceTo')}
        value={target?.id ?? ''}
        fallbackLabel={t('studio.scripts.replaceTo')}
        options={targets}
        disabled={disabled || !source || !targets.length}
        buttonVariant="outline"
        className="xmimo-studio-cast-select"
        align="start"
        onSelect={setToId}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !source || !target}
        onClick={() => {
          if (!source || !target) return
          onReplace(source.option.id, target.id)
          setFromId('')
          setToId('')
        }}
      >
        {source ? t('studio.scripts.replaceLines').replace('{count}', String(source.count)) : t('studio.scripts.replaceApply')}
      </Button>
    </div>
  )
}
