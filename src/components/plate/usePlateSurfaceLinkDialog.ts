import { useCallback } from 'react'
import type { PlateEditor } from 'platejs/react'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
import { capturePlateSlashUrlInsertion } from '@/components/plate/slash'

type PlateUrlDialog = {
  open: (request: NonNullable<ReturnType<typeof capturePlateSlashUrlInsertion>>) => void
}

export const usePlateSurfaceLinkDialog = (editor: PlateEditor, urlDialog: PlateUrlDialog) =>
  useCallback(
    (targetEditor: PlateEditor = editor) => {
      if (!targetEditor.selection) return false
      const request =
        capturePlateSelectionLinkInsertion(targetEditor) ??
        capturePlateSlashUrlInsertion(targetEditor, 'link', {
          query: '',
          range: targetEditor.selection,
          slashText: '',
        })
      urlDialog.open(request)
      return true
    },
    [editor, urlDialog],
  )
