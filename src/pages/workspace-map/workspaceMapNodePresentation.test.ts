import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  mergeWorkspaceMapNodeGeometry,
  presentWorkspaceMapNode,
} from '@/pages/workspace-map/workspaceMapNodePresentation'
import { WORKSPACE_MAP_FILE_HEIGHT, WORKSPACE_MAP_FILE_WIDTH } from '@/logic/graphLayoutMetrics'

const node = (
  id: string,
  type: string,
  data: Partial<GraphNodeData> = {},
): Node<GraphNodeData> => ({
  data: { label: id, workspaceMap: true, ...data },
  id,
  position: { x: 0, y: 0 },
  type,
})

describe('workspace map node presentation', () => {
  it('preserves persisted layout markers across graph refreshes', () => {
    const incoming = node('file:notes/a.md', 'file', { path: 'notes/a.md' })
    const current = node('file:notes/a.md', 'file', {
      path: 'notes/a.md',
      workspaceMapPersistedCollapsed: true,
      workspaceMapUserModified: true,
    })

    expect(mergeWorkspaceMapNodeGeometry(incoming, current).data).toMatchObject({
      workspaceMapPersistedCollapsed: true,
      workspaceMapUserModified: true,
    })
  })

  it('keeps default layout dimensions out of mutable node geometry', () => {
    const file = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', { path: 'notes/a.md' }),
      null,
    )
    const webpage = presentWorkspaceMapNode(
      node('ext:https://example.com', 'external', { url: 'https://example.com' }),
      null,
    )

    expect(file.width).toBeUndefined()
    expect(file.height).toBeUndefined()
    expect(file.dragHandle).toBeUndefined()
    expect(webpage.width).toBeUndefined()
    expect(webpage.height).toBeUndefined()
    expect(webpage.dragHandle).toBe('.workspace-map-web-drag-handle')
    expect(webpage.draggable).toBe(true)
  })

  it('limits dragging to the title strip only while a Markdown editor is active', () => {
    const active = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', { path: 'notes/a.md' }),
      'notes/a.md',
    )

    expect(active.dragHandle).toBe('.workspace-map-resource-drag-handle')
  })

  it('restores whole-node dragging when a rich preview is collapsed', () => {
    const collapsed = presentWorkspaceMapNode(
      node('ext:https://example.com', 'external', {
        url: 'https://example.com',
        workspaceMapDisclosure: { collapsed: true, toggle: () => undefined },
      }),
      null,
    )

    expect(collapsed.dragHandle).toBeUndefined()
    expect(collapsed.draggable).toBe(true)
  })

  it.each([
    ['external', { url: 'https://example.com' }],
    ['preview', { path: 'guide.pdf', previewKind: 'pdf' }],
  ] as const)('removes the %s drag handle when its preview is pinned', (type, data) => {
    const pinned = presentWorkspaceMapNode(
      node(`${type}:pinned`, type, { ...data, workspaceMapPinned: true }),
      null,
    )

    expect(pinned.draggable).toBe(false)
    expect(pinned.dragHandle).toBeUndefined()
  })

  it('preserves user position and resized dimensions across graph refreshes', () => {
    const incoming = node('preview:guide.pdf', 'preview', {
      path: 'guide.pdf',
      previewKind: 'pdf',
    })
    const current = {
      ...incoming,
      height: 510,
      measured: { height: 510, width: 740 },
      position: { x: 420, y: 180 },
      style: { height: 510, width: 740 },
      width: 740,
    }

    expect(mergeWorkspaceMapNodeGeometry(incoming, current)).toMatchObject({
      height: 510,
      measured: { height: 510, width: 740 },
      position: { x: 420, y: 180 },
      style: { height: 510, width: 740 },
      width: 740,
    })
  })

  it('gives an activated editor explicit geometry instead of measuring Plate content', () => {
    const active = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', { path: 'notes/a.md' }),
      'notes/a.md',
    )

    expect(active).toMatchObject({
      height: WORKSPACE_MAP_FILE_HEIGHT,
      style: { height: WORKSPACE_MAP_FILE_HEIGHT, width: WORKSPACE_MAP_FILE_WIDTH },
      width: WORKSPACE_MAP_FILE_WIDTH,
    })
  })

  it('replaces incidental inactive measurements when an editor activates', () => {
    const inactive = {
      ...presentWorkspaceMapNode(node('file:notes/a.md', 'file', { path: 'notes/a.md' }), null),
      measured: { height: 240, width: 320 },
    }
    const active = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', {
        path: 'notes/a.md',
        workspaceMapEditor: {} as GraphNodeData['workspaceMapEditor'],
      }),
      'notes/a.md',
    )

    expect(mergeWorkspaceMapNodeGeometry(active, inactive)).toMatchObject({
      height: WORKSPACE_MAP_FILE_HEIGHT,
      measured: undefined,
      width: WORKSPACE_MAP_FILE_WIDTH,
    })
  })

  it('preserves an inactive node user resize when its editor activates', () => {
    const inactive = {
      ...presentWorkspaceMapNode(node('file:notes/a.md', 'file', { path: 'notes/a.md' }), null),
      height: 680,
      style: { height: 680, width: 760 },
      width: 760,
    }
    const active = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', {
        path: 'notes/a.md',
        workspaceMapEditor: {} as GraphNodeData['workspaceMapEditor'],
      }),
      'notes/a.md',
    )

    expect(mergeWorkspaceMapNodeGeometry(active, inactive)).toMatchObject({
      height: 680,
      style: { height: 680, width: 760 },
      width: 760,
    })
  })

  it('expands a pinned compact node when its editor activates', () => {
    const inactive = {
      ...presentWorkspaceMapNode(
        node('file:notes/a.md', 'file', {
          path: 'notes/a.md',
          workspaceMapPinned: true,
        }),
        null,
      ),
      height: 112,
      style: { height: 112, width: 248 },
      width: 248,
    }
    const active = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', {
        path: 'notes/a.md',
        workspaceMapEditor: {} as GraphNodeData['workspaceMapEditor'],
      }),
      'notes/a.md',
    )

    expect(mergeWorkspaceMapNodeGeometry(active, inactive)).toMatchObject({
      data: { workspaceMapPinned: true },
      draggable: false,
      height: WORKSPACE_MAP_FILE_HEIGHT,
      width: WORKSPACE_MAP_FILE_WIDTH,
    })
  })

  it('keeps expanded style dimensions when compact graph data refreshes', () => {
    const incoming = {
      ...node('file:notes/a.md', 'file', { path: 'notes/a.md' }),
      height: 72,
      style: { height: 72, width: 220 },
      width: 220,
    }
    const current = {
      ...incoming,
      height: 640,
      measured: { height: 640, width: 520 },
      style: { height: 640, width: 520 },
      width: 520,
    }

    expect(mergeWorkspaceMapNodeGeometry(incoming, current)).toMatchObject({
      height: 640,
      measured: { height: 640, width: 520 },
      style: { height: 640, width: 520 },
      width: 520,
    })
  })

  it('does not promote measured dimensions into user-resized geometry', () => {
    const incoming = node('file:notes/a.md', 'file', { path: 'notes/a.md' })
    const current = {
      ...incoming,
      measured: { height: 240, width: 320 },
      position: { x: 120, y: 80 },
    }

    const merged = mergeWorkspaceMapNodeGeometry(incoming, current)

    expect(merged.measured).toEqual({ height: 240, width: 320 })
    expect(merged.position).toEqual({ x: 120, y: 80 })
    expect(merged.width).toBeUndefined()
    expect(merged.height).toBeUndefined()
  })

  it('keeps a pinned node immovable across graph refreshes', () => {
    const incoming = presentWorkspaceMapNode(
      node('file:notes/a.md', 'file', { path: 'notes/a.md' }),
      null,
    )
    const current = {
      ...incoming,
      data: { ...incoming.data, workspaceMapPinned: true },
      draggable: false,
    }

    expect(mergeWorkspaceMapNodeGeometry(incoming, current)).toMatchObject({
      data: { workspaceMapPinned: true },
      draggable: false,
    })
  })
})
