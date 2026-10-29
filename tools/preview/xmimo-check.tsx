import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceReadingPreview } from './voice-reading-preview.js'
import { PreviewSettingsScope } from './mock-settings.js'
import { CLIENT_STYLES } from '../../src/client/style/index.js'
import { zh } from '../../src/client/localization.js'
import type { LocaleKey, Translate } from '../../src/client/localization.js'
import './preview.css'
import './preview-shell.css'

const scope = new PreviewSettingsScope()
const t: Translate = (key) => zh[key as LocaleKey]

function Check(): ReactElement {
  const [instance, setInstance] = useState(0)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const theme = params.get('theme')
    if (theme !== null) document.documentElement.dataset.theme = theme
    const provider = params.get('provider')
    const apply = provider === null ? Promise.resolve(true) : scope.set('provider', provider)
    void apply.then(() => {
      setInstance((current) => current + 1)
    })
  }, [])
  useEffect(() => {
    const target = new URLSearchParams(location.search).get('open')
    if (target === null) return
    const index = Number(target)
    const timer = setTimeout(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.xmimo-voice-reading-selector')
      buttons[Number.isNaN(index) ? 0 : index]?.click()
    }, 600)
    return () => { clearTimeout(timer) }
  }, [instance])
  return <div className="preview-canvas">
    <main className="preview-page">
      <section className="preview-voice-surface" style={{ maxWidth: '560px', marginInline: 'auto' }}>
        <div key={instance}>
          <VoiceReadingPreview scope={scope} t={t} onOpenPluginSettings={() => { window.location.href = './#settings' }} />
        </div>
        <button type="button" onClick={() => { setInstance((current) => current + 1) }}>重置</button>
      </section>
    </main>
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('check root missing')
createRoot(rootElement).render(<Check />)
