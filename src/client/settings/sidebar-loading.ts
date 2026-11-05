import type { Translate } from '../localization.js'

/** The overlay belongs to the operation, so replacing the settings page cannot remove it. */
export async function withSidebarLoading<T>(mounted: boolean, t: Translate, operation: () => Promise<T>): Promise<T> {
  const dialog = document.createElement('dialog')
  dialog.className = 'xmimo-ui-scope xmimo-tts-sidebar-loading'
  dialog.tabIndex = -1
  const message = t(mounted ? 'settings.mountingSidebar' : 'settings.unmountingSidebar')
  dialog.setAttribute('aria-label', message)
  dialog.addEventListener('cancel', event => event.preventDefault())
  const status = document.createElement('div')
  status.className = 'xmimo-tts-sidebar-loading-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.setAttribute('aria-busy', 'true')
  const spinner = document.createElement('span')
  spinner.className = 'xmimo-tts-sidebar-loading-spinner'
  spinner.setAttribute('aria-hidden', 'true')
  const text = document.createElement('span')
  text.textContent = message
  status.append(spinner, text)
  dialog.append(status)
  document.body.append(dialog)
  try {
    dialog.showModal()
    await afterPaint()
    return await operation()
  } finally {
    // Let the destination render before releasing the modal's interaction lock.
    await afterPaint()
    dialog.close()
    dialog.remove()
  }
}

function afterPaint(): Promise<void> {
  return new Promise(resolve => {
    let frame: number | undefined
    const finish = (): void => {
      clearTimeout(timer)
      if (frame !== undefined) cancelAnimationFrame(frame)
      resolve()
    }
    // Hidden tabs may pause animation frames; they must still finish the operation.
    const timer = setTimeout(finish, 100)
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish) })
  })
}
