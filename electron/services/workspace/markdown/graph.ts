import type {
  FsGraph,
  FsGraphEdge,
  FsGraphNode,
  FsIndexedMarkdownFile,
  FsMarkdownLink,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast.js'
import { parseMarkdownBlocks } from '@electron/services/workspace/markdown/blocks.js'
import { extractHeadingEntries } from '@electron/services/workspace/markdown/headings.js'
import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'
import { fileLabel } from '@electron/services/workspace/markdown/utils.js'

type GraphTarget = {
  id: string
  edgeKind: FsGraphEdge['kind']
  headingPath?: string
}

export const buildWorkspaceGraph = (index: FsWorkspaceIndex): FsGraph => {
  const nodes: FsGraphNode[] = []
  const edges: FsGraphEdge[] = []
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const headings = new Map<string, FsGraphNode>()
  const headingContainsEdges = new Set<string>()

  for (const file of index.files) {
    nodes.push(fileNode(file.path))
    for (const heading of file.headings) {
      const id = headingNodeId(file.path, heading.slug)
      headings.set(id, {
        id,
        kind: 'heading',
        label: heading.text,
        path: file.path,
        line: heading.line,
        level: heading.level,
        slug: heading.slug,
      })
    }
  }

  const added = new Set(nodes.map((node) => node.id))
  for (const file of index.files) {
    const source = fileNodeId(file.path)
    for (const link of file.links) {
      const target = workspaceGraphTarget(link, filesByPath, headings, index.files, nodes, added)
      if (target.headingPath) {
        addHeadingContainsEdge(target.headingPath, target.id, edges, headingContainsEdges)
      }
      edges.push({
        id: `${source}->${target.id}-${edges.length}`,
        source,
        target: target.id,
        kind: target.edgeKind,
      })
    }
  }

  return { mode: 'mindmap', nodes, edges }
}

export const buildOutlineGraph = (filePath: string, content: string): FsGraph => {
  const nodes: FsGraphNode[] = [fileNode(filePath)]
  const edges: FsGraphEdge[] = []
  const entries = extractHeadingEntries(filePath, parseMarkdownAst(content))
  const stack: Array<{ level: number; id: string }> = []
  const lines = content.split(/\r?\n/)

  entries.forEach((entry, index) => {
    const heading = entry.heading
    const id = headingNodeId(filePath, heading.slug)
    const nextLine = entries[index + 1]?.heading.line ?? lines.length + 1
    const contentStartLine = Math.min(entry.contentStartLine, nextLine)
    const contentLines = lines.slice(
      contentStartLine - 1,
      Math.max(contentStartLine - 1, nextLine - 1),
    )
    const headingContent = trimLineBreaks(contentLines.join('\n'))
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop()

    const parent = stack.length > 0 ? stack[stack.length - 1]!.id : fileNodeId(filePath)
    nodes.push({
      id,
      kind: 'heading',
      label: heading.text,
      path: filePath,
      line: heading.line,
      level: heading.level,
      slug: heading.slug,
      content: headingContent,
      content_blocks: parseMarkdownBlocks(id, headingContent),
      content_start_line: contentStartLine,
      content_end_line: nextLine,
    })
    edges.push({
      id: `${parent}->${id}-${edges.length}`,
      source: parent,
      target: id,
      kind: 'contains',
    })
    stack.push({ level: heading.level, id })
  })

  return { mode: 'outline', nodes, edges }
}

export const fileNode = (filePath: string): FsGraphNode => {
  return { id: fileNodeId(filePath), kind: 'file', label: fileLabel(filePath), path: filePath }
}

export const fileNodeId = (filePath: string): string => {
  return `file:${filePath}`
}

export const headingNodeId = (filePath: string, slug: string): string => {
  return `heading:${filePath}:${slug}`
}

const workspaceGraphTarget = (
  link: FsMarkdownLink,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  headings: Map<string, FsGraphNode>,
  files: FsIndexedMarkdownFile[],
  nodes: FsGraphNode[],
  added: Set<string>,
): GraphTarget => {
  if (link.is_external) {
    const id = `ext:${link.target}`
    if (!added.has(id)) {
      added.add(id)
      nodes.push({
        id,
        kind: 'external',
        label: link.text.trim() || externalLabel(link.target),
        line: link.line,
      })
    }
    return { id, edgeKind: 'links_to' }
  }

  const targetPath =
    resolveIndexedLinkPath(link, filesByPath, files) ?? link.target_path ?? link.target
  if (link.target_heading_slug) {
    const id = headingNodeId(targetPath, link.target_heading_slug)
    const heading = headings.get(id)
    if (heading) {
      if (!added.has(id)) {
        added.add(id)
        nodes.push(heading)
      }
      return { id, edgeKind: 'references_heading', headingPath: targetPath }
    }
  }

  if (filesByPath.has(targetPath)) return { id: fileNodeId(targetPath), edgeKind: 'links_to' }

  const missingId = `missing:${targetPath}`
  if (!added.has(missingId)) {
    added.add(missingId)
    nodes.push({
      id: missingId,
      kind: 'missing',
      label: fileLabel(targetPath),
      path: targetPath,
      line: link.line,
    })
  }
  return { id: missingId, edgeKind: 'links_to' }
}

const addHeadingContainsEdge = (
  filePath: string,
  headingId: string,
  edges: FsGraphEdge[],
  added: Set<string>,
): void => {
  const source = fileNodeId(filePath)
  const key = `${source}->${headingId}`
  if (added.has(key)) return

  added.add(key)
  edges.push({
    id: `${source}->${headingId}-${edges.length}`,
    source,
    target: headingId,
    kind: 'contains',
  })
}

const externalLabel = (target: string): string => {
  try {
    return new URL(target).host || target
  } catch {
    return (
      target
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        ?.trim() || target
    )
  }
}

const trimLineBreaks = (value: string): string => {
  return value.replace(/^\n+|\n+$/g, '')
}
