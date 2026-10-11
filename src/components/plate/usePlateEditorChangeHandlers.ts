import { useCallback, type RefObject } from 'react'
import type { PlateEditor } from 'platejs/react'
import {
  invalidateChangedPlateHeadingIndex,
  usePlateActiveHeading,
} from '@/components/plate/usePlateActiveHeading'
import { usePlateDocumentNavigation } from '@/components/plate/usePlateDocumentNavigation'

type PlateEditorChangeHandlerOptions = {
  acceptsLocalChanges: () => boolean
  activePath: string | null
  changeRevisionRef: { current: number }
  editableRef: RefObject<HTMLDivElement | null>
  editor: PlateEditor
  externalApplyRef: { current: boolean }
  headingTrackingEnabled: boolean
  markSnapshotDirty: () => void
  onEditorChange: () => void
  onSelectionChange: () => void
  queueSnapshot: () => void
  syncActiveFocusBlock: () => void
  syncSlashFromEditor: () => void
}

export const usePlateEditorChangeHandlers = ({
  acceptsLocalChanges,
  activePath,
  changeRevisionRef,
  editableRef,
  editor,
  externalApplyRef,
  headingTrackingEnabled,
  markSnapshotDirty,
  onEditorChange,
  onSelectionChange,
  queueSnapshot,
  syncActiveFocusBlock,
  syncSlashFromEditor,
}: PlateEditorChangeHandlerOptions) => {
  const scheduleNavigationMeasure = usePlateDocumentNavigation(
    activePath,
    editableRef,
    headingTrackingEnabled,
  )
  const syncHeading = usePlateActiveHeading(activePath, editor, headingTrackingEnabled)
  const handleValueChange = useCallback(() => {
    invalidateChangedPlateHeadingIndex(editor, externalApplyRef.current)
    syncHeading()
    scheduleNavigationMeasure()
    if (externalApplyRef.current || !acceptsLocalChanges()) return
    markSnapshotDirty()
    changeRevisionRef.current += 1
    onEditorChange()
    queueSnapshot()
  }, [
    acceptsLocalChanges,
    changeRevisionRef,
    editor,
    externalApplyRef,
    markSnapshotDirty,
    onEditorChange,
    queueSnapshot,
    scheduleNavigationMeasure,
    syncHeading,
  ])
  const handleSelectionChange = useCallback(() => {
    onSelectionChange()
    syncSlashFromEditor()
    syncActiveFocusBlock()
    syncHeading()
  }, [onSelectionChange, syncActiveFocusBlock, syncHeading, syncSlashFromEditor])

  return { handleSelectionChange, handleValueChange }
}
