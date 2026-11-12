import type { ReactElement } from 'react'
import { useId } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_READ_SCOPES } from '../../../shared.js'
import type { TtsReadScope } from '../../../shared.js'
import type { Translate } from '../../localization.js'
import { readScopeHintKey, readScopeLabelKey } from '../voice-reading-options.js'

const SAMPLE_PARAGRAPH_LINES = [2, 3, 2] as const

// A schematic reply: opening segment, supporting detail, then the key takeaway.
const PREVIEW_PARAGRAPHS: Record<TtsReadScope, readonly number[]> = {
  smart: [0],
  full: [0, 1, 2],
  concise: [0, 2],
}

interface ReadScopeCardsProps {
  value: TtsReadScope
  disabled: boolean
  t: Translate
  onChange: (value: TtsReadScope) => void
}

export function ReadScopeCards({ value, disabled, t, onChange }: ReadScopeCardsProps): ReactElement {
  const id = useId()
  return <div className="xmimo-read-scope">
    <fieldset className="xmimo-read-scope-fieldset" disabled={disabled}>
      <legend className="xmimo-read-scope-sr-only">{t('settings.readScope')}</legend>
      <div className="xmimo-read-scope-options">
        {TTS_READ_SCOPES.map(scope => {
          const paragraphs = PREVIEW_PARAGRAPHS[scope]
          return <label className="xmimo-read-scope-option" key={scope}>
            <input type="radio" name={id} value={scope} checked={scope === value} aria-labelledby={`${id}-${scope}-title`} aria-describedby={scope === value ? `${id}-hint` : undefined} onChange={() => { onChange(scope) }} />
            <span className="xmimo-read-scope-card">
              <span className="xmimo-read-scope-heading">
                <span id={`${id}-${scope}-title`}>{t(readScopeLabelKey(scope))}</span>
                {scope === 'concise' ? <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag> : null}
                <span className="xmimo-read-scope-radio" aria-hidden="true" />
              </span>
              <span className="xmimo-read-scope-sample" aria-hidden="true">
                {SAMPLE_PARAGRAPH_LINES.map((lineCount, index) => <span key={index} className="xmimo-read-scope-paragraph" data-spoken={paragraphs.includes(index)}>
                  {Array.from({ length: lineCount }, (_, line) => <span key={line} className="xmimo-read-scope-skeleton-line" />)}
                </span>)}
              </span>
            </span>
          </label>
        })}
      </div>
    </fieldset>
    <p className="xmimo-read-scope-hint" id={`${id}-hint`} aria-live="polite">{t(readScopeHintKey(value))}</p>
  </div>
}
