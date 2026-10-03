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

  it('reserves one stable rich-preview size for every workspace map resource', () => {
    const preview: Node<GraphNodeData> = {
      id: 'preview:image.png',
      type: 'preview',
      position: { x: 0, y: 0 },
      data: { label: 'image.png', previewKind: 'image', workspaceMap: true },
    }

    expect(getGraphNodeLayoutSize(preview)).toEqual({ width: 360, height: 220 })
  })

  it('reserves the fixed rendered size for workspace map PDF previews', () => {
    const preview: Node<GraphNodeData> = {
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      position: { x: 0, y: 0 },
      data: {
        label: 'brief.pdf',
        path: 'docs/brief.pdf',
        previewKind: 'pdf',
        workspaceMap: true,
      },
    }

    expect(getGraphNodeLayoutSize(preview)).toEqual({ width: 360, height: 220 })
  })
})
