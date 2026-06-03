import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import EditFilePage from '@/pages/EditFilePage'
import FileGraphPage from '@/pages/FileGraphPage'
import GitDiffRoutePage from '@/pages/GitDiffRoutePage'
import SourceFilePage from '@/pages/SourceFilePage'
import WorkspaceGraphPage from '@/pages/WorkspaceGraphPage'
import WorkspaceHomePage from '@/pages/WorkspaceHomePage'
import {
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
} from '@/logic/routing'

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<WorkspaceHomePage />} />
        <Route path={GIT_DIFF_ROUTE_PATTERN} element={<GitDiffRoutePage />} />
        <Route path={SOURCE_ROUTE_PATTERN} element={<SourceFilePage />} />
        <Route path={GRAPH_FILE_ROUTE_PATTERN} element={<FileGraphPage />} />
        <Route path={GRAPH_WORKSPACE_ROUTE_PATTERN} element={<WorkspaceGraphPage />} />
        <Route path={FILE_ROUTE_PATTERN} element={<EditFilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </HashRouter>
)

export default App
