import type { NodeApi } from 'react-arborist'
import { createFileLabel } from '@/logic/paths'
import { fsApi } from '@/services/fsApi'
import type { FileTreeNode } from '@/logic/fileTree'
import { writeClipboardText } from '@/runtime/clipboard'

export const appendChildPath = (parentPath: string, name: string) =>
  [parentPath, name].filter(Boolean).join('/')

export const parentPath = (path: string) => path.split('/').slice(0, -1).join('/')

export const renamePath = (path: string, nextName: string) =>
  [...path.split('/').slice(0, -1), nextName].filter(Boolean).join('/')

export const getCreateParentPath = (node: NodeApi<FileTreeNode> | null) => {
  if (!node || node.isRoot) return ''
  return node.data.type === 'folder' ? node.data.path : parentPath(node.data.path)
}

const escapeMarkdownLinkLabel = (label: string) => label.replace(/\\/g, '\\\\').replace(/]/g, '\\]')

export const createMarkdownLink = (path: string) =>
  `[${escapeMarkdownLinkLabel(createFileLabel(path))}](<${path.replace(/>/g, '%3E')}>)`

export const copyText = (value: string) => writeClipboardText(value)

export const copyAbsolutePath = (path: string) => fsApi.copyAbsolutePathToClipboard(path)

export const revealPath = (path: string) => fsApi.revealPathInSystem(path)

export const openPathInSystem = (path: string) => fsApi.openPathInSystem(path)

export const reportFileTreeActionError = (action: string) => (error: unknown) => {
  console.error(`${action} failed`, error)
}
