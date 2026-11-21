import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import {
  TbAdjustmentsHorizontal,
  TbBounceRight,
  TbCircle,
  TbDeviceGamepad2,
  TbDiamond,
  TbFeather,
  TbLeaf,
  TbMoonStars,
  TbMovie,
  TbRipple,
  TbSettings,
  TbUfo,
} from 'react-icons/tb'
import type { SoundPack } from '../shared.js'

const SOUND_PACK_ICONS: Record<SoundPack, IconType> = {
  minimal: TbCircle,
  soft: TbFeather,
  glass: TbDiamond,
  arcade: TbDeviceGamepad2,
  mechanical: TbSettings,
  organic: TbLeaf,
  dreamy: TbMoonStars,
  scifi: TbUfo,
  rubber: TbBounceRight,
  cinematic: TbMovie,
  studio: TbAdjustmentsHorizontal,
  zen: TbRipple,
}

export function SoundPackIcon({ pack }: { pack: SoundPack }): ReactElement {
  const Icon = SOUND_PACK_ICONS[pack]
  return <Icon className="xmimo-tts-sound-pack-icon" size={20} strokeWidth={1.8} aria-hidden="true" focusable="false" />
}
