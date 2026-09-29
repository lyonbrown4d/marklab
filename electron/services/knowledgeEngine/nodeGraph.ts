import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import { parseMarkdownBlocks } from '@electron/services/workspace/markdown/blocks.js'
import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets.js'
import { fileLabel, normalizeWorkspacePath } from '@electron/services/workspace/markdown/utils.js'
import type {
  FsGraph,
  FsGraphEdge,
  FsGraphNode,
  FsIndexedMarkdownFile,
} from '@electron/services/workspace/types.js'

type GraphDocument = { path: string; title?: string; content: string }
type KnownPaths = { paths: string[]; assetPaths: string[] }

export const buildNodeOutlineGraph = (filePath: string, content: string): FsGraph => {
  const normalizedPath = normalizeWorkspacePath(filePath)
  const parsed = parseMarkdownDocument(normalizedPath, content)
  const lines = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const nodes: FsGraphNode[] = [fileNode(normalizedPath)]
  const edges: FsGraphEdge[] = []
  const stack: Array<{ level: number; id: string }> = []

  parsed.headings.forEach((heading, index) => {
    const id = headingNodeId(normalizedPath, heading.slug)
    const nextLine = parsed.headings[index + 1]?.line ?? lines.length + 1
    const contentStartLine = Math.min(heading.line + 1, nextLine)
    const headingContent = lines
      .slice(contentStartLine - 1, nextLine - 1)
      .join('\n')
      .trim()
    while ((stack.at(-1)?.level ?? 0) >= heading.level) stack.pop()
    const parent = stack.at(-1)?.id ?? fileNodeId(normalizedPath)
    nodes.push({
      content: headingContent,
      content_blocks: blocksForHeading(id, headingContent),
      content_end_line: nextLine,
      content_start_line: contentStartLine,
      id,
      kind: 'heading',
      label: heading.text,
      level: heading.level,
      line: heading.line,
      path: normalizedPath,
      slug: heading.slug,
    })
    edges.push({
      id: `${parent}->${id}-${edges.length}`,
      kind: 'contains',
      source: parent,
      target: id,
    })
    stack.push({ id, level: heading.level })
  })
  return { edges, mode: 'outline', nodes }
}

export const buildNodeWorkspaceGraph = (
  documents: GraphDocument[],
  knownPaths: KnownPaths,
): FsGraph => {
  const indexed = documents
    .map((document) => ({
      document,
      parsed: parseMarkdownDocument(normalizeWorkspacePath(document.path), document.content),
    }))
    .sort((left, right) => left.parsed.path.localeCompare(right.parsed.path))
  const files = indexed.map((item) => item.parsed)
  const filesByPath = new Map(files.map((file) => [file.path, file]))
  const assetPaths = new Set(knownPaths.assetPaths.map(normalizeWorkspacePath))
  const nodes: FsGraphNode[] = files.map((file) => fileNode(file.path))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: FsGraphEdge[] = []
  const contains = new Set<string>()

  for (const { parsed } of indexed) {
    for (const link of parsed.links) {
      const target = graphTarget(link, files, filesByPath, assetPaths)
      if (!target) continue
      if (target.node && !nodeIds.has(target.node.id)) {
        nodeIds.add(target.node.id)
        nodes.push(target.node)
      }
      if (target.headingPath) {
        const containsKey = `${target.headingPath}->${target.id}`
        if (!contains.has(containsKey)) {
          contains.add(containsKey)
          edges.push({
            id: `${fileNodeId(target.headingPath)}->${target.id}-${edges.length}`,
            kind: 'contains',
            source: fileNodeId(target.headingPath),
            target: target.id,
          })
        }
      }
      edges.push({
        id: `${fileNodeId(parsed.path)}->${target.id}-${edges.length}`,
        kind: target.kind,
        source: fileNodeId(parsed.path),
        target: target.id,
      })
    }
  }
  return { edges, mode: 'mindmap', nodes }
}

const graphTarget = (
  link: FsIndexedMarkdownFile['links'][number],
  files: FsIndexedMarkdownFile[],
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  assetPaths: Set<string>,
): {
  id: string
  kind: 'links_to' | 'references_heading'
  headingPath?: string
  node?: FsGraphNode
} | null => {
  if (link.is_external) {
    const id = `ext:${link.target}`
    return {
      id,
      kind: 'links_to',
      node: { id, kind: 'external', label: link.text || link.target, line: link.line },
    }
  }
  const targetPath = resolveIndexedLinkPath(link, filesByPath, files)
  if (!targetPath || assetPaths.has(targetPath) || hasNonMarkdownExtension(targetPath)) return null
  if (link.target_heading_slug) {
    const heading = filesByPath
      .get(targetPath)
      ?.headings.find((candidate) => candidate.slug === link.target_heading_slug)
    if (heading) {
      const id = headingNodeId(targetPath, heading.slug)
      return {
        headingPath: targetPath,
        id,
        kind: 'references_heading',
        node: {
          id,
          kind: 'heading',
          label: heading.text,
          level: heading.level,
          line: heading.line,
          path: targetPath,
          slug: heading.slug,
        },
      }
    }
  }
  if (filesByPath.has(targetPath)) return { id: fileNodeId(targetPath), kind: 'links_to' }
  const id = `missing:${targetPath}`
  return {
    id,
    kind: 'links_to',
    node: { id, kind: 'missing', label: fileLabel(targetPath), line: link.line, path: targetPath },
  }
}

const fileNodeId = (path: string): string => `file:${path}`
const headingNodeId = (path: string, slug: string): string => `heading:${path}:${slug}`

const fileNode = (path: string): FsGraphNode => ({
  id: fileNodeId(path),
  kind: 'file',
  label: fileLabel(path),
  path,
})

const hasNonMarkdownExtension = (value: string): boolean => {
  const extension = value.split('/').at(-1)?.split('.').at(-1)?.toLocaleLowerCase()
  return Boolean(extension && extension !== value && extension !== 'md' && extension !== 'markdown')
}

const blocksForHeading = (
  baseId: string,
  content: string,
): NonNullable<FsGraphNode['content_blocks']> => parseMarkdownBlocks(baseId, content)
