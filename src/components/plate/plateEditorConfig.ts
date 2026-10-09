import { createElement } from 'react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { FindReplacePlugin } from '@platejs/find-replace'
import type { PlateChunkProps, PlateEditor } from 'platejs/react'
import { createPlateNodePlugins, type PlatePreviewOptions } from '@/components/plate/nodes'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'
import {
  PLATE_CHUNK_INTRINSIC_BLOCK_SIZE,
  PlateVirtualChunk,
} from '@/components/plate/PlateVirtualChunk'
import { handlePlateBlockMoveShortcut } from '@/components/plate/selection/plateBlockSelection'
import { PlateFindMatchLeaf } from '@/components/plate/PlateFindMatchLeaf'

export const createPlateEditorPlugins = (previewOptions: PlatePreviewOptions = {}) => [
  BlockSelectionPlugin.configure({
    options: {
      areaOptions: {
        behaviour: {
          scrolling: { speedDivider: 0.8 },
          startThreshold: 4,
        },
      },
      enableContextMenu: true,
      isSelectable: (_element, path) => path.length === 1,
      onKeyDownSelecting: (editor, event) => {
        handlePlateBlockMoveShortcut(editor as PlateEditor, event)
      },
    },
  }),
  FindReplacePlugin.configure({ render: { node: PlateFindMatchLeaf } }),
  ...createPlateNodePlugins(previewOptions),
  plateMarkdownPlugin,
]

export const plateChunkingOptions = {
  chunkSize: 20,
  contentVisibilityAuto: true,
} as const

// Editable chunks must retain Slate's node-to-DOM mappings for selection and IME input.
export const renderPlateEditorChunk = ({ attributes, children, lowest }: PlateChunkProps) => {
  if (!lowest) return children

  return createElement(
    'div',
    {
      ...attributes,
      style: {
        containIntrinsicBlockSize: PLATE_CHUNK_INTRINSIC_BLOCK_SIZE,
        contentVisibility: 'auto',
      },
    },
    children,
  )
}

export const renderReadOnlyPlateEditorChunk = ({
  attributes,
  children,
  lowest,
}: PlateChunkProps) => {
  if (!lowest) return children

  return createElement(PlateVirtualChunk, { attributes, children })
}
