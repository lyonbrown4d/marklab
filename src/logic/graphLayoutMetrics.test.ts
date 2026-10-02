import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { createGraphNodeLayoutSignature, getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'

const fileNode = (active: boolean): Node<GraphNodeData> => ({
  id: 'file:notes/example.md',
  type: 'file',
  position: { x: 0, y: 0 },
  data: {
    label: 'example',
    path: 'notes/example.md',
    workspaceMap: true,
    workspaceMapEditor: active
      ? {
          active: true,
          loadState: { status: 'ready', content: '# Example' },
          onChange: () => undefined,
          onClose: () => undefined,
          onOpenFull: () => undefined,
          onRetry: () => undefined,
          readOnly: false,
        }
      : undefined,
  },
})

describe('workspace map graph layout metrics', () => {
  it('uses one stable page size and layout signature before and during editing', () => {
    const inactive = fileNode(false)
    const active = fileNode(true)

    expect(getGraphNodeLayoutSize(inactive)).toEqual({ width: 520, height: 640 })
    expect(getGraphNodeLayoutSize(active)).toEqual({ width: 520, height: 640 })
    expect(createGraphNodeLayoutSignature(active)).toBe(createGraphNodeLayoutSignature(inactive))
  })

  it('uses one compact size for every lightweight workspace map reference', () => {
    const preview: Node<GraphNodeData> = {
      id: 'preview:image.png',
      type: 'preview',
      position: { x: 0, y: 0 },
      data: { label: 'image.png', workspaceMap: true },
    }

    expect(getGraphNodeLayoutSize(preview)).toEqual({ width: 200, height: 96 })
  })
})
