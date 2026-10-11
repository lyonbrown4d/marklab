import {
  useEditorComposing,
  useEditorReadOnly,
  useEditorRef,
  useEditorSelection,
} from 'platejs/react'
import type { RefObject } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  PlateSelectionToolbar,
  type PlateSelectionToolbarLabels,
} from '@/components/plate/selection/PlateSelectionToolbar'
import { usePlateSelectionToolbar } from '@/components/plate/usePlateSelectionToolbar'

type PlateSelectionToolbarOverlayProps = {
  canEdit: () => boolean
  editableRef: RefObject<HTMLElement | null>
  labels: PlateSelectionToolbarLabels
  onAi?: Parameters<typeof usePlateSelectionToolbar>[0]['onAi']
  onLink?: Parameters<typeof usePlateSelectionToolbar>[0]['onLink']
}

export const PlateSelectionToolbarOverlay = ({
  canEdit,
  editableRef,
  labels,
  onAi,
  onLink,
}: PlateSelectionToolbarOverlayProps) => {
  const editor = useEditorRef()
  const readOnly = useEditorReadOnly()
  const selectionVersion = useEditorSelection()
  useEditorComposing()
  const handleError = useCallback(
    (error: unknown) => {
      toast.error(labels.copyError, {
        description: error instanceof Error ? error.message : String(error),
      })
    },
    [labels.copyError],
  )
  const controller = usePlateSelectionToolbar({
    canEdit,
    editableRef,
    editor,
    onAi,
    onError: handleError,
    onLink,
    readOnly,
    selectionVersion,
  })
  return <PlateSelectionToolbar {...controller} labels={labels} />
}
