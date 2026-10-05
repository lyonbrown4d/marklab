import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const DEFAULT_NODE_WIDTH = 190
const DEFAULT_NODE_HEIGHT = 62
const HEADING_NODE_WIDTH = 180
const HEADING_NODE_HEIGHT = 56
const FILE_NODE_WIDTH = 200
const FILE_NODE_HEIGHT = 54
const EXTERNAL_WEB_NODE_WIDTH = 340
const EXTERNAL_WEB_NODE_HEIGHT = 210
const WORKSPACE_MAP_NODE_HEIGHT = 96
export const WORKSPACE_MAP_COMPACT_NODE_WIDTH = 220
export const WORKSPACE_MAP_COMPACT_NODE_HEIGHT = 72
export const WORKSPACE_MAP_FILE_WIDTH = 520
export const WORKSPACE_MAP_FILE_HEIGHT = 640
export const WORKSPACE_MAP_RESOURCE_NODE_WIDTH = 360
export const WORKSPACE_MAP_RESOURCE_NODE_HEIGHT = 220

export const FULL_HEADING_NODE_MAX_HEIGHT = 360

export const getGraphNodeLayoutSize = (node: Node<GraphNodeData>) => {
  if (node.data.workspaceMapDisclosure?.collapsed) {
    return {
      width: WORKSPACE_MAP_COMPACT_NODE_WIDTH,
      height: WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
    }
  }
  const currentWidth = node.width ?? node.measured?.width
  const currentHeight = node.height ?? node.measured?.height
  if (currentWidth && currentHeight) return { width: currentWidth, height: currentHeight }
  if (node.data.workspaceMap) {
    if (node.type === 'file') {
      return { width: WORKSPACE_MAP_FILE_WIDTH, height: WORKSPACE_MAP_FILE_HEIGHT }
    }
    if (node.type === 'preview' && node.data.previewKind) {
      return {
        width: WORKSPACE_MAP_RESOURCE_NODE_WIDTH,
        height: WORKSPACE_MAP_RESOURCE_NODE_HEIGHT,
      }
    }
    if (node.type === 'external' && node.data.url) {
      return {
        width: WORKSPACE_MAP_RESOURCE_NODE_WIDTH,
        height: WORKSPACE_MAP_RESOURCE_NODE_HEIGHT,
      }
    }
    return { width: FILE_NODE_WIDTH, height: WORKSPACE_MAP_NODE_HEIGHT }
  }

  if (node.id.startsWith('file:')) {
    return { width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT }
  }
  if (node.type === 'external' && node.data.url) {
    return { width: EXTERNAL_WEB_NODE_WIDTH, height: EXTERNAL_WEB_NODE_HEIGHT }
  }
  if (node.type === 'heading' || node.id.startsWith('heading:')) {
    if (node.data.contentMode === 'full') {
      return { width: 260, height: estimateHeadingNodeHeight(node) }
    }
    if (node.data.contentMode === 'summary' && node.data.content) {
      return { width: 240, height: 124 }
    }
    return { width: HEADING_NODE_WIDTH, height: HEADING_NODE_HEIGHT }
  }
  if (node.type === 'preview' || node.id.startsWith('preview:')) {
    return { width: 320, height: 118 }
  }
  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
}

export const createGraphNodeLayoutSignature = (node: Node<GraphNodeData>): string => {
  const { width, height } = getGraphNodeLayoutSize(node)
  return [
    node.id,
    node.type ?? '',
    node.data.contentMode ?? '',
    width,
    height,
    node.data.label.length,
  ].join(':')
}

const estimateHeadingNodeHeight = (node: Node<GraphNodeData>) => {
  const blocks = node.data.contentBlocks
  if (!blocks?.length) return 170

  const blockHeight = blocks.reduce((height, block) => {
    if (block.kind === 'code') return height + 90
    if (block.kind === 'list') return height + Math.min(120, 28 + block.items.length * 22)
    if (block.kind === 'divider') return height + 34
    if (block.kind === 'blockquote') return height + 56
    if (block.kind === 'table') return height + 70
    return height + 44
  }, 52)

  return Math.min(FULL_HEADING_NODE_MAX_HEIGHT, Math.max(130, blockHeight))
}
