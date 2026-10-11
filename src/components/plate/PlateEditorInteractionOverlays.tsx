import type { PlateEditor } from 'platejs/react'
import { PlateDocumentFind } from '@/components/plate/PlateDocumentFind'
import {
  PlateEditorOverlays,
  type PlateEditorOverlaysProps,
} from '@/components/plate/PlateEditorOverlays'
import { PlateSelectionStats } from '@/components/plate/selection/PlateSelectionStats'
import type { PlateSlashCommandLabels } from '@/components/plate/slash'

type InteractionOverlaysProps = Omit<PlateEditorOverlaysProps, 'labels'> & {
  contentReady: boolean
  editor: PlateEditor
  interactionActive: boolean
  labels?: PlateSlashCommandLabels
  readOnly: boolean
}

export const PlateEditorInteractionOverlays = ({
  contentReady,
  editor,
  interactionActive,
  readOnly,
  ...overlayProps
}: InteractionOverlaysProps) => (
  <>
    {interactionActive && contentReady && (
      <PlateDocumentFind
        editableRef={overlayProps.editableRef}
        editor={editor}
        key={overlayProps.activePath ?? ''}
        virtualized={readOnly}
      />
    )}
    <PlateSelectionStats />
    {interactionActive && contentReady && overlayProps.labels && (
      <PlateEditorOverlays {...overlayProps} labels={overlayProps.labels} />
    )}
  </>
)
