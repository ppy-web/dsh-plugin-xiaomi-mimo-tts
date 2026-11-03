import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VOICE_READING_SECTION_ID, registerVoiceReadingNavIcon } = await loadClientModule('src/client/settings/nav-icon.tsx')

test('Voice reading registers its nav icon under the matching section id', async () => {
  const ctx = new Context(), registered = new Map()
  ctx.provide('slots', {
    register(options, component) {
      registered.set(options.id, { options, component })
      return () => registered.delete(options.id)
    },
  })
  try {
    const dispose = registerVoiceReadingNavIcon(ctx)
    const entry = registered.get(VOICE_READING_SECTION_ID)
    assert.equal(VOICE_READING_SECTION_ID, 'voice-reading')
    assert.equal(entry.options.name, 'settings.section.icon')
    assert.equal(entry.options.id, 'voice-reading')
    const html = renderToStaticMarkup(createElement(entry.component, { size: 16, active: true }))
    assert.match(html, /^<svg\b/u)
    dispose()
    assert.equal(registered.size, 0)
  } finally {
    await ctx.fiber.dispose()
  }
})
