import { UndirectedGraph } from 'graphology'
import louvain from 'graphology-communities-louvain'
import { parse as parseToml } from 'smol-toml'
import { parseDocument as parseYamlDocument } from 'yaml'

import type { MarkdownNode, MarkdownRoot } from '@electron/services/workspace/markdown/ast'
import type { FsGraphEdge, FsGraphGroup } from '@electron/services/workspace/types'
import { createWorkspaceNodeOwnerResolver } from '@electron/services/knowledgeEngine/workspaceGraphOwnership'

export type WorkspaceGroupDocument = {
  id: string
  path: string
  tree: MarkdownRoot
}

type DocumentSignals = {
  explicitGroup: string | null
  labels: Map<string, string>
  tokens: Set<string>
}

const GROUP_FIELDS = ['group', 'category', 'collection'] as const
const GENERIC_TOKENS = new Set([
  'docs',
  'document',
  'documentation',
  'guide',
  'home',
  'index',
  'markdown',
  'notes',
  'overview',
  'readme',
])
const MAX_TOKEN_COMMUNITY_SIZE = 16
const MAX_GROUP_LABEL_LENGTH = 80
const MAX_SEMANTIC_TOKEN_LENGTH = 64
const MAX_SEMANTIC_TOKENS_PER_DOCUMENT = 64

export const deriveWorkspaceGraphGroups = (
  documents: WorkspaceGroupDocument[],
  edges: FsGraphEdge[],
): Map<string, FsGraphGroup> => {
  if (documents.length === 0) return new Map()

  const signals = new Map(documents.map((document) => [document.id, documentSignals(document)]))
  const paths = new Map(documents.map((document) => [document.id, document.path]))
  const unlabeledDocuments = documents.filter(
    (document) => !signals.get(document.id)?.explicitGroup,
  )
  const graph = new UndirectedGraph()
  unlabeledDocuments.forEach((document) => graph.addNode(document.id))
  const weights = collectRelationshipWeights(documents, edges, signals)
  weights.forEach((weight, pair) => {
    const [source, target] = pair.split('\0')
    if (source && target && graph.hasNode(source) && graph.hasNode(target)) {
      graph.addEdge(source, target, { weight })
    }
  })

  const communities =
    graph.size > 0
      ? louvain(graph, { getEdgeWeight: 'weight', randomWalk: false, resolution: 1.15 })
      : Object.fromEntries(unlabeledDocuments.map((document, index) => [document.id, index]))
  const members = new Map<number, string[]>()
  unlabeledDocuments.forEach((document) => {
    const community = communities[document.id] ?? members.size
    const group = members.get(community) ?? []
    group.push(document.id)
    members.set(community, group)
  })

  const result = new Map<string, FsGraphGroup>()
  signals.forEach((signal, nodeId) => {
    if (signal.explicitGroup) result.set(nodeId, explicitGroup(signal.explicitGroup))
  })
  const explicitNeighbors = collectExplicitNeighbors(weights, signals)
  members.forEach((nodeIds) => {
    const inherited = inheritedExplicitGroup(nodeIds, explicitNeighbors)
    const group = inherited ?? describeCommunity(nodeIds, paths, signals)
    nodeIds.forEach((nodeId) => result.set(nodeId, group))
  })
  return result
}

const collectExplicitNeighbors = (
  weights: Map<string, number>,
  signals: Map<string, DocumentSignals>,
) => {
  const neighbors = new Map<string, Map<string, FsGraphGroup>>()
  weights.forEach((_weight, pair) => {
    const [left, right] = pair.split('\0')
    if (!left || !right) return
    const leftGroup = signals.get(left)?.explicitGroup
    const rightGroup = signals.get(right)?.explicitGroup
    const unlabeledId = leftGroup ? (rightGroup ? null : right) : rightGroup ? left : null
    const value = leftGroup ?? rightGroup
    if (!unlabeledId || !value) return
    const group = explicitGroup(value)
    const groups = neighbors.get(unlabeledId) ?? new Map<string, FsGraphGroup>()
    groups.set(group.key, group)
    neighbors.set(unlabeledId, groups)
  })
  return neighbors
}

const inheritedExplicitGroup = (
  nodeIds: string[],
  neighbors: Map<string, Map<string, FsGraphGroup>>,
): FsGraphGroup | null => {
  const candidates = new Map<string, FsGraphGroup>()
  nodeIds.forEach((nodeId) => {
    neighbors.get(nodeId)?.forEach((group) => candidates.set(group.key, group))
  })
  return candidates.size === 1 ? ([...candidates.values()][0] ?? null) : null
}

const collectRelationshipWeights = (
  documents: WorkspaceGroupDocument[],
  edges: FsGraphEdge[],
  signals: Map<string, DocumentSignals>,
) => {
  const knownIds = new Set(documents.map((document) => document.id))
  const weights = new Map<string, number>()
  const resolveOwner = createWorkspaceNodeOwnerResolver(knownIds, edges)
  const addWeight = (left: string, right: string, weight: number) => {
    if (left === right || !knownIds.has(left) || !knownIds.has(right)) return
    const pair = left.localeCompare(right) < 0 ? `${left}\0${right}` : `${right}\0${left}`
    weights.set(pair, (weights.get(pair) ?? 0) + weight)
  }

  edges.forEach((edge) => {
    const source = resolveOwner(edge.source)
    const target = resolveOwner(edge.target)
    if (source && target) addWeight(source, target, 5)
  })
  const tokenOwners = new Map<string, string[]>()
  signals.forEach((signal, nodeId) => {
    signal.tokens.forEach((token) => {
      const owners = tokenOwners.get(token) ?? []
      owners.push(nodeId)
      tokenOwners.set(token, owners)
    })
  })
  tokenOwners.forEach((owners) => {
    if (owners.length < 2 || owners.length > MAX_TOKEN_COMMUNITY_SIZE) return
    owners.forEach((source, index) => {
      owners.slice(index + 1).forEach((target) => addWeight(source, target, 1))
    })
  })
  return weights
}

const describeCommunity = (
  nodeIds: string[],
  paths: Map<string, string>,
  signals: Map<string, DocumentSignals>,
): FsGraphGroup => {
  const tokenScore = new Map<string, { count: number; label: string }>()
  nodeIds.forEach((nodeId) => {
    signals.get(nodeId)?.labels.forEach((label, token) => {
      const current = tokenScore.get(token)
      tokenScore.set(token, { count: (current?.count ?? 0) + 1, label: current?.label ?? label })
    })
  })
  const semantic = [...tokenScore.entries()]
    .filter(([, value]) => value.count > 1)
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))[0]
  if (semantic) {
    return {
      key: `semantic:${semantic[0]}:${stableHash(nodeIds)}`,
      label: semantic[1].label,
      source: 'semantic',
    }
  }

  const folder = commonFolder(nodeIds.map((nodeId) => paths.get(nodeId) ?? ''))
  if (folder) {
    return {
      key: `path:${encodeURIComponent(folder.toLowerCase())}`,
      label: humanize(folder.split('/').at(-1) ?? folder),
      source: 'path',
    }
  }
  return {
    key: `workspace:${stableHash(nodeIds)}`,
    label: 'Workspace',
    source: 'workspace',
  }
}

const documentSignals = (document: WorkspaceGroupDocument): DocumentSignals => {
  const labels = new Map<string, string>()
  const addText = (text: string) => {
    for (const part of text.split(/[^\p{L}\p{N}]+/u)) {
      const token = part.toLowerCase()
      if (
        labels.size >= MAX_SEMANTIC_TOKENS_PER_DOCUMENT ||
        token.length < 2 ||
        token.length > MAX_SEMANTIC_TOKEN_LENGTH ||
        GENERIC_TOKENS.has(token)
      ) {
        continue
      }
      labels.set(token, labels.get(token) ?? humanize(part))
    }
  }
  const explicitGroup = frontmatterGroup(document.tree)
  walk(document.tree, (node) => {
    if (node.type === 'heading' && (node.depth ?? 7) <= 3) addText(nodeText(node))
  })
  document.path
    .replace(/\.md$/i, '')
    .split(/[\\/._-]+/)
    .forEach(addText)
  return { explicitGroup, labels, tokens: new Set(labels.keys()) }
}

const frontmatterGroup = (tree: MarkdownRoot): string | null => {
  const frontmatter = tree.children.find((node) => node.type === 'yaml' || node.type === 'toml')
  if (!frontmatter?.value) return null
  try {
    if (frontmatter.type === 'yaml') {
      const document = parseYamlDocument(frontmatter.value, {
        customTags: [],
        prettyErrors: false,
        schema: 'core',
        uniqueKeys: true,
      })
      if (document.errors.length > 0) return null
      for (const field of GROUP_FIELDS) {
        const value = boundedGroupLabel(document.get(field))
        if (value) return value
      }
      return null
    }

    const table = parseToml(frontmatter.value)
    for (const field of GROUP_FIELDS) {
      const value = boundedGroupLabel(Object.hasOwn(table, field) ? table[field] : null)
      if (value) return value
    }
  } catch {
    return null
  }
  return null
}

const boundedGroupLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const label = value.trim()
  return label.length > 0 && [...label].length <= MAX_GROUP_LABEL_LENGTH ? label : null
}

const explicitGroup = (label: string): FsGraphGroup => ({
  key: `frontmatter:${stableHash([label.normalize('NFKC').toLowerCase()])}`,
  label,
  source: 'frontmatter',
})

const walk = (node: MarkdownNode, visit: (node: MarkdownNode) => void) => {
  visit(node)
  node.children?.forEach((child) => walk(child, visit))
}

const nodeText = (node: MarkdownNode): string => {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? ''
  return node.children?.map(nodeText).join(' ') ?? ''
}

const commonFolder = (paths: string[]) => {
  const folders = paths.map((path) => path.replaceAll('\\', '/').split('/').slice(0, -1)[0] ?? '')
  return folders.length > 0 && folders.every((folder) => folder === folders[0]) ? folders[0] : ''
}

const humanize = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase())
    .trim()

const stableHash = (values: string[]) => {
  let hash = 2166136261
  for (const character of [...values].sort().join('\0')) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
