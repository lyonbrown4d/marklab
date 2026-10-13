import { useCallback, useRef, type RefObject } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { createWorkspaceDialog } from '@/runtime/dialog'
import { projectLoaderErrorMessage } from '@/app/projectLoaderUtils'
import { toast } from 'sonner'

export const useCreateWorkspace = (
  openFolder: (path: string) => Promise<boolean>,
  rootSwitchingRef: RefObject<boolean>,
  onBeforeWorkspaceOpen?: () => Promise<void>,
) => {
  const { t } = useI18n()
  const creatingWorkspace = useRef(false)
  return useCallback(
    async (name: string): Promise<boolean> => {
      if (creatingWorkspace.current || rootSwitchingRef.current) return false
      creatingWorkspace.current = true
      rootSwitchingRef.current = true
      try {
        await onBeforeWorkspaceOpen?.()
        await flushEditorChanges()
        const createdPath = await createWorkspaceDialog({
          name,
          title: t('dialog.selectWorkspaceParent'),
        })
        if (!createdPath) return false
        rootSwitchingRef.current = false
        return await openFolder(createdPath)
      } catch (error) {
        toast.error(t('projectLoader.createWorkspaceFailed'), {
          description: projectLoaderErrorMessage(error),
        })
        return false
      } finally {
        creatingWorkspace.current = false
        rootSwitchingRef.current = false
      }
    },
    [onBeforeWorkspaceOpen, openFolder, rootSwitchingRef, t],
  )
}
