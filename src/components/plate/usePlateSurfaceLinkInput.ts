import { useCallback } from 'react'
import type { PlateEditor } from 'platejs/react'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
import { capturePlateSlashUrlInsertion } from '@/components/plate/slash'

type PlateUrlInput = {
  open: (request: NonNullable<ReturnType<typeof capturePlateSlashUrlInsertion>>) => void
}

export const usePlateSurfaceLinkInput = (
  editor: PlateEditor,
  urlInput: PlateUrlInput,
  canEdit: () => boolean,
) =>
  useCallback(
    (targetEditor: PlateEditor = editor) => {
      if (!canEdit() || !targetEditor.selection) return false
      const request =
        capturePlateSelectionLinkInsertion(targetEditor) ??
        capturePlateSlashUrlInsertion(targetEditor, 'link', {
          query: '',
          range: targetEditor.selection,
          slashText: '',
        })
      urlInput.open(request)
      return true
    },
    [canEdit, editor, urlInput],
  )
