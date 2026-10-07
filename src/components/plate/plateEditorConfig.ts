import { createElement } from 'react'
import type { PlateChunkProps } from 'platejs/react'
import { createPlateNodePlugins, type PlatePreviewOptions } from '@/components/plate/nodes'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'
import {
  PLATE_CHUNK_INTRINSIC_BLOCK_SIZE,
  PlateVirtualChunk,
} from '@/components/plate/PlateVirtualChunk'

export const createPlateEditorPlugins = (previewOptions: PlatePreviewOptions = {}) => [
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
