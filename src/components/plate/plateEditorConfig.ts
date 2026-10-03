import { createElement } from 'react'
import type { PlateChunkProps } from 'platejs/react'
import { createPlateNodePlugins, type PlatePreviewOptions } from '@/components/plate/nodes'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'

export const createPlateEditorPlugins = (previewOptions: PlatePreviewOptions = {}) => [
  ...createPlateNodePlugins(previewOptions),
  plateMarkdownPlugin,
]

export const plateChunkingOptions = {
  chunkSize: 20,
  contentVisibilityAuto: true,
} as const

const PLATE_CHUNK_INTRINSIC_BLOCK_SIZE = 'auto 800px'

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
