/**
 * Client stylesheet assembly — the single <style> tag the plugin injects.
 *
 * Every UI module owns one CSS file under ./style/. Files are imported with
 * `?raw` (inlined as text at build time by the rawTextImports plugin in
 * tsdown.config.ts; Vite preview supports ?raw natively) and concatenated
 * below, so CASCADE ORDER == the order of this list:
 *
 *   1. component modules (action → volume),
 *   2. responsive.css (max-width) then motion.css (prefers-reduced-motion)
 *      last — they intentionally override the base modules,
 *   3. global.css at the very end: design tokens + shared module chrome
 *      (see the header comment in style/global.css).
 *
 * When adding styles: put them in the module file that owns the UI (create a
 * new one if needed) and add its import here in cascade order.
 */
import action from './style/action.css?raw'
import base from './style/base.css?raw'
import apiKey from './style/api-key.css?raw'
import card from './style/card.css?raw'
import fields from './style/fields.css?raw'
import voice from './style/voice.css?raw'
import cardActions from './style/card-actions.css?raw'
import character from './style/character.css?raw'
import details from './style/details.css?raw'
import mixer from './style/mixer.css?raw'
import preview from './style/preview.css?raw'
import sections from './style/sections.css?raw'
import sound from './style/sound.css?raw'
import volume from './style/volume.css?raw'
import responsive from './style/responsive.css?raw'
import motion from './style/motion.css?raw'
import global from './style/global.css?raw'

export const CLIENT_STYLES = [
  action,
  base,
  apiKey,
  card,
  fields,
  voice,
  cardActions,
  character,
  details,
  mixer,
  preview,
  sections,
  sound,
  volume,
  responsive,
  motion,
  global,
].join('\n')
