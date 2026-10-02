import type { FsSearchResult, FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry, RootKind, ThemeMode, ViewMode, WorkspaceTab } from '@/store/appTypes'
import type { WorkspaceView } from '@/app/useEditorRoutes'

export type TabLabelText = {
  workspaceGraph: string
  source: string
  graph: string
  preview: string
  diff: string
}

export type TitlebarMenuItem = {
  id: string
  label: string
}

export type TitlebarMenuGroup = {
  label: string
  items: TitlebarMenuItem[]
}

export type TitlebarCommandFile = {
  path: string
  label: string
}

export type TitlebarCommandHeading = {
  path: string
  slug: string
  text: string
  level: number
  label: string
}

export type TitlebarProps = {
  activePath: string | null
  activeTab: WorkspaceTab | null
  tabs: WorkspaceTab[]
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onOpenWorkspaceGraph: () => void
  onOpenWorkspaceFiles?: () => void
  onOpenAllPages: (collectionId?: string) => void
  onOpenHistory: () => void
  onOpenProject: (path: string) => void
  onOpenCurrentWorkspaceInNewWindow: () => void
  onSelectWorkspaceInNewWindow: () => void
  onToggleReadOnly: () => void
  onCloseActiveTab: () => void
  onOpenTerminal: () => void
  onRebuildSearchIndex: () => void
  onChangeView: (mode: ViewMode) => void
  viewMode: ViewMode
  files: FileEntry[]
  workspaceIndex: FsWorkspaceIndex | null
  workspaceKey: string
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  commandOpen?: boolean
  onCommandOpenChange?: (open: boolean) => void
  onOpenSettings: () => void
  recentProjects: string[]
  rootKind: RootKind
  rootPath: string
  workspaceWindowOpening: boolean
  workspaceView?: WorkspaceView
}
