import type { FsGraph } from '@/services/fsGraphSchemas'

const titles = [
  '知识图谱与跨平台工作区设计说明',
  'Incremental indexing and document lifecycle',
  '多窗口编辑状态与文件同步边界',
  'Renderer memory budget and startup performance',
  '🔬 实验记录：图标、长标题与标签碰撞',
  '👩🏽‍💻 Collaborative editor implementation notes',
  'Architecture review — typed IPC and local files',
  '中文技术文档排版与可访问性检查清单',
]
export const denseDocuments = Object.fromEntries(
  Array.from({ length: 36 }, (_, index) => {
    const title = `${String(index + 1).padStart(2, '0')} ${titles[index % titles.length]}`
    return [`${title}.md`, `# ${title}\n\nLinked document ${index + 1}.\n`]
  }),
)
export const densePaths = Object.keys(denseDocuments)
export const denseGraphFixture = (): FsGraph => {
  const nodes = densePaths.map((path, index) => ({
    // Deliberately close rows stress label placement without a browser-side layout worker.
    position: { x: (index % 6) * 1.5, y: Math.floor(index / 6) * 1.3 },
    id: `file:${path}`,
    kind: 'file' as const,
    label: path.slice(0, -3),
    path,
    group: { key: '.', label: '.', source: 'path' as const },
  }))
  const edges = nodes.flatMap((node, index) => [
    {
      id: `ring-${index}`,
      source: node.id,
      target: nodes[(index + 1) % nodes.length].id,
      kind: 'links_to' as const,
      count: 1,
    },
    ...(index
      ? [
          {
            id: `hub-${index}`,
            source: nodes[0].id,
            target: node.id,
            kind: 'links_to' as const,
            count: 1,
          },
        ]
      : []),
  ])
  return {
    mode: 'relations',
    revision: 'dense-labels-v1',
    topology_key: 'dense-labels-v1',
    truncated: false,
    total_nodes: nodes.length,
    total_edges: edges.length,
    nodes,
    edges,
  }
}
