import type { RefObject } from 'react'
import { PlateSelectionToolbarOverlay } from '@/components/plate/selection'
import type { PlateEditor } from 'platejs/react'
import type { PlateSelectionToolbarLabels } from '@/components/plate/selection/PlateSelectionToolbar'
import { createPlateSelectionToolbarFallbackLabels } from '@/components/plate/selection/plateSelectionToolbarLabels'
import {
  PlateSlashOverlays,
  type PlateSlashCommandLabels,
  type PlateSlashCommandsController,
} from '@/components/plate/slash'

export type PlateEditorOverlaysProps = {
  activePath: string | null
  canEdit: () => boolean
  editableRef: RefObject<HTMLElement | null>
  labels: PlateSlashCommandLabels
  onAi?: () => void
  onLink: (editor: PlateEditor) => void
  selectionLabels?: PlateSelectionToolbarLabels
  slash: PlateSlashCommandsController
}

export const PlateEditorOverlays = ({
  activePath,
  canEdit,
  editableRef,
  labels,
  onAi,
  onLink,
  selectionLabels,
  slash,
}: PlateEditorOverlaysProps) => (
  <>
    <PlateSelectionToolbarOverlay
      canEdit={canEdit}
      editableRef={editableRef}
      labels={selectionLabels ?? createPlateSelectionToolbarFallbackLabels(labels)}
      onAi={onAi}
      onLink={onLink}
    />
    <PlateSlashOverlays activePath={activePath} controller={slash} labels={labels} />
  </>
)
