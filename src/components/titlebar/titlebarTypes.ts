import type { SaveState } from '@/app/useEditorBuffer'
import type { FsSearchResult, FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry, ThemeMode, ViewMode, WorkspaceTab } from '@/store/appTypes'

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
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  silentSave: boolean
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
  onOpenAllPages: (collectionId?: string) => void
  onCloseActiveTab: () => void
  onOpenTerminal: () => void
  onRebuildSearchIndex: () => void
  onChangeView: (mode: ViewMode) => void
  files: FileEntry[]
  workspaceIndex: FsWorkspaceIndex | null
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  commandOpen: boolean
  onCommandOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}
