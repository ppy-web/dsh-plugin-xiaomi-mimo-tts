import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useState } from 'react'
import type { ReactElement } from 'react'

export function useWarningToast(): readonly [(text: string) => void, ReactElement | null] {
  const [notice, setNotice] = useState<{ text: string; sequence: number } | null>(null)
  const showWarning = useCallback((text: string) => {
    setNotice(current => ({ text, sequence: (current?.sequence ?? 0) + 1 }))
  }, [])
  const toast = notice ? <Toast
    key={notice.sequence}
    text={notice.text}
    icon={<IconWarningOutlineRegular size={18} />}
    holdMs={5000}
    onDone={() => setNotice(current => current === notice ? null : current)}
  /> : null
  return [showWarning, toast]
}
