import { createPlateNodePlugins, type PlatePreviewOptions } from '@/components/plate/nodes'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'

export const createPlateEditorPlugins = (previewOptions: PlatePreviewOptions = {}) => [
  ...createPlateNodePlugins(previewOptions),
  plateMarkdownPlugin,
]

export const plateChunkingOptions = {
  chunkSize: 48,
  contentVisibilityAuto: true,
} as const
