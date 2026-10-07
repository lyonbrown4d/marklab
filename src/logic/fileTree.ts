import type { FileEntry } from '@/store/appTypes'

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  hasChildren?: boolean
  childrenLoaded?: boolean
}

export const filterTree = (nodes: FileTreeNode[], query: string): FileTreeNode[] => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return nodes

  return nodes
    .map((node) => {
      const matched = node.name.toLowerCase().includes(normalized)
      if (node.type === 'file') {
        return matched ? node : null
      }
      const children = node.children ? filterTree(node.children, normalized) : []
      if (matched || children.length > 0) {
        return { ...node, children }
      }
      return null
    })
    .filter((node): node is FileTreeNode => node !== null)
}

export const buildFileTree = (entries: FileEntry[]) => {
  const root: FileTreeNode = { name: 'root', path: '', type: 'folder', children: [] }
  const nodesByPath = new Map<string, FileTreeNode>([['', root]])

  entries.forEach((entry) => {
    const parts = entry.path.split('/')
    parts.forEach((part, index) => {
      const parentPath = parts.slice(0, index).join('/')
      const nodePath = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      const parent = nodesByPath.get(parentPath)
      if (!parent) return
      if (!parent.children) parent.children = []
      let next = nodesByPath.get(nodePath)
      if (!next) {
        const type = isFile ? entry.kind : 'folder'
        next = {
          name: part,
          path: nodePath,
          type,
          children: type === 'folder' ? [] : undefined,
          hasChildren: isFile && type === 'folder' ? entry.hasChildren : true,
          childrenLoaded: isFile && type === 'folder' ? entry.childrenLoaded : true,
        }
        parent.children.push(next)
        nodesByPath.set(nodePath, next)
      } else if (isFile) {
        next.type = entry.kind
        next.children = entry.kind === 'folder' ? (next.children ?? []) : undefined
        next.hasChildren = entry.hasChildren
        next.childrenLoaded = entry.childrenLoaded
      }
    })
  })

  return root.children ?? []
}
