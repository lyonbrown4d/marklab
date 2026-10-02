import { fileViewForOpenPath, isMarkdownFilePath } from '@/logic/fileTypes'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FileEntry, FileViewKind, WorkspaceTab } from '@/store/appTypes'

type FileTab = Extract<WorkspaceTab, { kind: 'file' }>

const normalizeFileTab = (tab: FileTab): FileTab => ({
  ...tab,
  view: fileViewForOpenPath(tab.path, tab.view),
})

export const getWorkspaceFilesTarget = (
  tabs: WorkspaceTab[],
  entries: FileEntry[],
  activeTabId?: string | null,
  defaultFileView: FileViewKind = 'edit',
): FileTab | null => {
  const filePaths = new Set(
    entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path),
  )
  const activeFileTab = tabs.find(
    (tab): tab is FileTab =>
      tab.kind === 'file' && filePaths.has(tab.path) && getWorkspaceTabId(tab) === activeTabId,
  )
  if (activeFileTab) return normalizeFileTab(activeFileTab)
  const lastFileTab = [...tabs]
    .reverse()
    .find((tab): tab is FileTab => tab.kind === 'file' && filePaths.has(tab.path))
  if (lastFileTab) return normalizeFileTab(lastFileTab)

  const files = entries.filter((entry) => entry.kind === 'file')
  const fallback = files.find((entry) => isMarkdownFilePath(entry.path)) ?? files[0]
  return fallback
    ? {
        kind: 'file',
        path: fallback.path,
        view: fileViewForOpenPath(fallback.path, defaultFileView),
      }
    : null
}
