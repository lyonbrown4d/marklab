import type { FileEntry } from '@/store/appTypes'

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
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

  entries.forEach((entry) => {
    const parts = entry.path.split('/')
    let current = root
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      if (!current.children) current.children = []
      let next = current.children.find((child) => child.name === part)
      if (!next) {
        next = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isFile ? entry.kind : 'folder',
          children: isFile ? undefined : [],
        }
        current.children.push(next)
      }
      current = next
    })
  })

  return root.children ?? []
}
