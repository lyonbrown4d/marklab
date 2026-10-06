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
  it('uses one stable editing surface size and layout signature', () => {
    const inactive = fileNode(false)
    const active = fileNode(true)

    expect(getGraphNodeLayoutSize(inactive)).toEqual({ width: 420, height: 480 })
    expect(getGraphNodeLayoutSize(active)).toEqual({ width: 420, height: 480 })
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

  it('uses compact geometry for collapsed workspace map documents', () => {
    const collapsed = {
      ...fileNode(false),
      data: {
        ...fileNode(false).data,
        workspaceMapDisclosure: { collapsed: true, toggle: () => undefined },
      },
    }

    expect(getGraphNodeLayoutSize(collapsed)).toEqual({ width: 248, height: 112 })
  })

  it('invalidates the layout signature when the semantic group changes', () => {
    const operations = {
      ...fileNode(false),
      data: {
        ...fileNode(false).data,
        workspaceGroup: {
          key: 'frontmatter:operations:one',
          label: 'Operations',
          source: 'frontmatter',
        },
      },
    } satisfies Node<GraphNodeData>
    const platform = {
      ...operations,
      data: {
        ...operations.data,
        workspaceGroup: {
          key: 'frontmatter:platform:two',
          label: 'Platform',
          source: 'frontmatter',
        },
      },
    } satisfies Node<GraphNodeData>

    expect(createGraphNodeLayoutSignature(operations)).not.toBe(
      createGraphNodeLayoutSignature(platform),
    )
  })
})
