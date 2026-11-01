import { Navigate, type NavigateProps } from 'react-router-dom'
import { useWorkspacePane } from '@/features/workbench/paneContext'

// Passive editor groups must not redirect the application's focused route.
export const WorkspaceNavigate = (props: NavigateProps) => {
  const pane = useWorkspacePane()
  return !pane || pane.active ? <Navigate {...props} /> : null
}
