import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactElement } from 'react'
import type { Translate } from '../localization.js'

export function StudioDeleteDialog({ t, title, name, description, confirmLabel, onCancel, onConfirm }: {
  t: Translate
  title: string
  name: string
  description: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <Modal
      open
      tone="warning"
      title={title}
      description={description}
      closeLabel={t('studio.action.cancel')}
      onClose={onCancel}
      footer={<>
        <Button type="button" variant="outline" data-modal-autofocus onClick={onCancel}>{t('studio.action.cancel')}</Button>
        <Button type="button" variant="outline" className="xmimo-danger-action" onClick={onConfirm}>{confirmLabel ?? t('studio.action.delete')}</Button>
      </>}
    >
      <strong className="xmimo-studio-delete-name">{name}</strong>
    </Modal>
  )
}
