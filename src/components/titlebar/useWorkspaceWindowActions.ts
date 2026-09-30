import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/i18n/useI18n'
import { appApi, type AppWindowOpenResult } from '@/services/appApi'

const TOAST_ID = 'workspace-window-opening'

type RunWorkspaceWindowOpenOptions = {
  operation: () => Promise<AppWindowOpenResult>
  pendingRef: { current: boolean }
  setOpening: (opening: boolean) => void
  translate: (key: string) => string
}

const runWorkspaceWindowOpen = async (options: RunWorkspaceWindowOpenOptions): Promise<void> => {
  if (options.pendingRef.current) return
  options.pendingRef.current = true
  options.setOpening(true)
  toast.loading(options.translate('windowOpening.opening'), { id: TOAST_ID })
  try {
    const result = await options.operation()
    if (result.cancelled) {
      toast.dismiss(TOAST_ID)
      return
    }
    if (result.ok) {
      toast.success(options.translate('windowOpening.opened'), { id: TOAST_ID })
      return
    }
    toast.error(options.translate('windowOpening.failed'), {
      action: {
        label: options.translate('windowOpening.retry'),
        onClick: () => void runWorkspaceWindowOpen(options),
      },
      description: result.error,
      id: TOAST_ID,
    })
  } catch (error) {
    toast.error(options.translate('windowOpening.failed'), {
      action: {
        label: options.translate('windowOpening.retry'),
        onClick: () => void runWorkspaceWindowOpen(options),
      },
      description: error instanceof Error ? error.message : String(error),
      id: TOAST_ID,
    })
  } finally {
    options.pendingRef.current = false
    options.setOpening(false)
  }
}

export const useWorkspaceWindowActions = () => {
  const { t } = useI18n()
  const pendingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const run = useCallback(
    (operation: () => Promise<AppWindowOpenResult>) =>
      runWorkspaceWindowOpen({ operation, pendingRef, setOpening, translate: t }),
    [t],
  )

  const openCurrentWorkspaceInNewWindow = useCallback(
    () => run(appApi.openCurrentWorkspaceInNewWindow),
    [run],
  )
  const openWorkspacePathInNewWindow = useCallback(
    (path: string) => run(() => appApi.openPathInNewWindow(path)),
    [run],
  )
  const selectWorkspaceInNewWindow = useCallback(
    () => run(() => appApi.selectWorkspaceInNewWindow(t('actions.openWorkspaceInNewWindow'))),
    [run, t],
  )

  return {
    openCurrentWorkspaceInNewWindow,
    openWorkspacePathInNewWindow,
    opening,
    selectWorkspaceInNewWindow,
  }
}
