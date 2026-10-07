import { parseMarkdownDocument } from '@electron/services/workspace/markdown'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast'
import { resolveIndexedLinkPath } from '@electron/services/workspace/markdown/targets'
import { fileLabel, normalizeWorkspacePath } from '@electron/services/workspace/markdown/utils'
import { deriveWorkspaceGraphGroups } from '@electron/services/knowledgeEngine/workspaceGraphGroups'
import { workspaceDocumentAdapterForPath } from '@electron/services/workspace/documentAdapters'
import type {
  FsGraph,
  FsGraphEdge,
  FsGraphNode,
  FsIndexedMarkdownFile,
} from '@electron/services/workspace/types'

type GraphDocument = { path: string; title?: string; content: string }
type KnownPaths = { paths: string[]; assetPaths: string[] }

export const buildNodeWorkspaceGraph = (
  documents: GraphDocument[],
  knownPaths: KnownPaths,
): FsGraph => {
  const indexed = documents
    .map((document) => {
      const tree = parseMarkdownAst(document.content)
      return {
        document,
        parsed: parseMarkdownDocument(
          normalizeWorkspacePath(document.path),
          document.content,
          tree,
        ),
        tree,
      }
    })
    .sort((left, right) => left.parsed.path.localeCompare(right.parsed.path))
  const files = indexed.map((item) => item.parsed)
  const filesByPath = new Map(files.map((file) => [file.path, file]))
  const assetPaths = new Set(knownPaths.assetPaths.map(normalizeWorkspacePath))
  const nodes: FsGraphNode[] = indexed.map(({ parsed }) => fileNode(parsed.path))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: FsGraphEdge[] = []
  const contains = new Set<string>()

  for (const { parsed } of indexed) {
    for (const link of parsed.links) {
      const target = graphTarget(parsed.path, link, files, filesByPath, assetPaths)
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
    for (const asset of parsed.assets) {
      const target = previewTarget(parsed.path, asset.target, asset.target_path)
      if (!target) continue
      if (target.node && !nodeIds.has(target.node.id)) {
        nodeIds.add(target.node.id)
        nodes.push(target.node)
      }
      edges.push({
        id: `${fileNodeId(parsed.path)}->${target.id}-${edges.length}`,
        kind: target.kind,
        source: fileNodeId(parsed.path),
        target: target.id,
      })
    }
  }
  const groups = deriveWorkspaceGraphGroups(
    indexed.map(({ parsed, tree }) => ({ id: fileNodeId(parsed.path), path: parsed.path, tree })),
    edges,
  )
  nodes.forEach((node) => {
    const group = groups.get(node.id)
    if (group) node.group = group
  })
  return { edges, mode: 'mindmap', nodes }
}

const graphTarget = (
  sourcePath: string,
  link: FsIndexedMarkdownFile['links'][number],
  files: FsIndexedMarkdownFile[],
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  assetPaths: Set<string>,
): {
  id: string
  kind: 'links_to' | 'references_heading' | 'previews'
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
  const preview = previewTarget(sourcePath, link.target, targetPath)
  if (preview) return preview
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

const previewTarget = (
  sourcePath: string,
  target: string,
  targetPath?: string | null,
): {
  id: string
  kind: 'previews'
  node: FsGraphNode
} | null => {
  if (!targetPath) return null
  const adapter = workspaceDocumentAdapterForPath(targetPath)
  if (!adapter) return null
  const id = `preview:${targetPath}`
  return {
    id,
    kind: 'previews',
    node: {
      id,
      kind: 'preview',
      label: fileLabel(targetPath),
      path: targetPath,
      preview_kind: adapter.kind,
      source_path: sourcePath,
      target,
    },
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
