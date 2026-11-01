import { createContext, useContext } from 'react'
import type { FileViewKind } from '@/store/appTypes'

export type WorkspacePane = {
  id: string
  active: boolean
  visible: boolean
  recoveryKey: number
  registerFlush: (flush: () => Promise<void>) => () => void
  openFile: (path: string, view?: FileViewKind) => void
  openBeside: (path: string, view?: FileViewKind, activate?: boolean) => void
}
export const WorkspacePaneContext = createContext<WorkspacePane | null>(null)
export const useWorkspacePane = () => useContext(WorkspacePaneContext)
