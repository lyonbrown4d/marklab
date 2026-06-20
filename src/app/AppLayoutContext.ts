import type { GraphData } from '@/logic/graph'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type {
  FileEntry,
  FileViewKind,
  GraphContentMode,
  ThemeMode,
  ViewMode,
  WorkspaceTab,
} from '@/store/appTypes'
import type { SaveState } from '@/app/useEditorBuffer'

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  graphLoading: boolean
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  saveStates: Record<string, SaveState>
  loadingPaths: Record<string, true>
  currentView: ViewMode
  activeTab: WorkspaceTab | null
  rootPath: string
  recentProjects: string[]
  showEditorStatusBar: boolean
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  onCloseActiveTab: () => void
  onOpenProject: (path: string) => void
}
