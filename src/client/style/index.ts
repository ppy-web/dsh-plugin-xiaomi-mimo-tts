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
import action from './action.css?raw'
import base from './base.css?raw'
import apiKey from './api-key.css?raw'
import card from './card.css?raw'
import fields from './fields.css?raw'
import voice from './voice.css?raw'
import cardActions from './card-actions.css?raw'
import character from './character.css?raw'
import details from './details.css?raw'
import mixer from './mixer.css?raw'
import preview from './preview.css?raw'
import sections from './sections.css?raw'
import sound from './sound.css?raw'
import volume from './volume.css?raw'
import responsive from './responsive.css?raw'
import motion from './motion.css?raw'
import global from './global.css?raw'

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
