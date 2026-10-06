import type { FileTreeNode } from '@/logic/fileTree'

export type ContextLabels = {
  open: string
  openSource: string
  openInSystem: string
  revealInFolder: string
  copyPath: string
  copyAbsolutePath: string
  copyMarkdownLink: string
  copied: string
  actionFailed: string
  expand: string
  collapse: string
  newFile: string
  newFolder: string
  rename: string
  delete: string
  properties: string
  newFilePrompt: string
  newFolderPrompt: string
  renamePrompt: string
  deleteConfirm: string
  deleteFolderConfirm: string
}

export type SidebarFileTreeActions = {
  activePath: string | null
  readonlyTree: boolean
  labels: ContextLabels
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: 'source') => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onInspectPath: (path: string) => void
}

export type SidebarFileTreeProps = SidebarFileTreeActions & {
  nodes: FileTreeNode[]
  searchTerm: string
}
