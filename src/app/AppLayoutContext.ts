import type { GraphData } from '@/logic/graph'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type {
  FileEntry,
  FileViewKind,
  GraphContentMode,
  RootKind,
  ThemeMode,
  ViewMode,
  WorkspaceTab,
} from '@/store/appTypes'
import type { SaveState } from '@/app/useEditorBuffer'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  graphLoading: boolean
  graphError: unknown
  graphRetry: () => Promise<unknown>
  graphRefreshing: boolean
  graphEditorPath: string | null
  editorBufferPath: string | null
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  workspaceIndexLoading: boolean
  workspaceIndexError: unknown
  onRetryWorkspaceIndex: () => Promise<unknown>
  saveStates: Record<string, SaveState>
  loadingPaths: Record<string, true>
  currentView: ViewMode
  activeTab: WorkspaceTab | null
  rootPath: string
  rootKind: RootKind
  recentProjects: string[]
  showEditorStatusBar: boolean
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  editorReadOnlyMode: boolean
  onCloseActiveTab: () => void
  onOpenProject: (path: string) => void
  onOpenProjectInCurrentWindow: (path: string) => void
}

export type LayoutContextStore = StoreApi<LayoutContext>

export const createLayoutContextStore = (initialState: LayoutContext): LayoutContextStore =>
  createStore<LayoutContext>()(() => initialState)
