import {
  useEditorComposing,
  useEditorReadOnly,
  useEditorRef,
  useEditorSelection,
} from 'platejs/react'
import type { RefObject } from 'react'
import {
  PlateSelectionToolbar,
  type PlateSelectionToolbarLabels,
} from '@/components/plate/selection/PlateSelectionToolbar'
import { usePlateSelectionToolbar } from '@/components/plate/usePlateSelectionToolbar'

type PlateSelectionToolbarOverlayProps = {
  editableRef: RefObject<HTMLElement | null>
  labels: PlateSelectionToolbarLabels
  onLink?: Parameters<typeof usePlateSelectionToolbar>[0]['onLink']
}

export const PlateSelectionToolbarOverlay = ({
  editableRef,
  labels,
  onLink,
}: PlateSelectionToolbarOverlayProps) => {
  const editor = useEditorRef()
  const readOnly = useEditorReadOnly()
  useEditorSelection()
  useEditorComposing()
  const controller = usePlateSelectionToolbar({ editableRef, editor, onLink, readOnly })
  return <PlateSelectionToolbar {...controller} labels={labels} />
}
