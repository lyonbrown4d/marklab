import type { RefObject } from 'react'
import { PlateSelectionToolbarOverlay } from '@/components/plate/selection'
import type { PlateEditor } from 'platejs/react'
import {
  PlateSlashOverlays,
  type PlateSlashCommandLabels,
  type PlateSlashCommandsController,
} from '@/components/plate/slash'

export const PlateEditorOverlays = ({
  activePath,
  canEdit,
  editableRef,
  labels,
  onLink,
  slash,
}: {
  activePath: string | null
  canEdit: () => boolean
  editableRef: RefObject<HTMLElement | null>
  labels: PlateSlashCommandLabels
  onLink: (editor: PlateEditor) => void
  slash: PlateSlashCommandsController
}) => (
  <>
    <PlateSelectionToolbarOverlay
      canEdit={canEdit}
      editableRef={editableRef}
      labels={{
        bold: labels.bold,
        clear: labels.clearFormat,
        code: labels.inlineCode,
        italic: labels.italic,
        link: labels.link,
        strike: labels.strike,
        toolbar: labels.textGroup,
      }}
      onLink={onLink}
    />
    <PlateSlashOverlays activePath={activePath} controller={slash} labels={labels} />
  </>
)
