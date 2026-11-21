import { useId } from 'react'
import type { ReactElement } from 'react'
import { TTS_AVATAR_STYLES } from '../../shared.js'
import type { TtsAvatarStyle } from '../../shared.js'
import type { LocaleKey, Translate } from '../../localization.js'
import { VoiceAvatar } from './voice-avatar.js'

const LABELS: Record<TtsAvatarStyle, LocaleKey> = {
  default: 'settings.avatarDefault',
  pastel: 'settings.avatarPastel',
  sunrise: 'settings.avatarSunrise',
}

export function AvatarStyleCards({ value, disabled, t, onChange }: {
  value: TtsAvatarStyle
  disabled: boolean
  t: Translate
  onChange: (style: TtsAvatarStyle) => void
}): ReactElement {
  const id = useId()
  return <fieldset className="xmimo-read-scope-fieldset xmimo-avatar-styles" disabled={disabled}>
    <legend className="xmimo-read-scope-sr-only">{t('settings.avatarStyle')}</legend>
    <div className="xmimo-read-scope-options xmimo-avatar-style-options">
      {TTS_AVATAR_STYLES.map(style => <label className="xmimo-read-scope-option" key={style}>
        <input type="radio" name={id} value={style} checked={style === value} onChange={() => { onChange(style) }} />
        <span className="xmimo-read-scope-card">
          <span className="xmimo-read-scope-heading">{t(LABELS[style])}<span className="xmimo-read-scope-radio" aria-hidden="true" /></span>
          <span className="xmimo-avatar-style-samples" aria-hidden="true">
            {['a', 'b', 'c'].map(id => <VoiceAvatar key={id} avatarStyle={style} voice={{ provider: 'preview', id }} label="" />)}
          </span>
        </span>
      </label>)}
    </div>
  </fieldset>
}
