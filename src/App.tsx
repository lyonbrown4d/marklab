import { lazy, Suspense, type ComponentType } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import {
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  PREVIEW_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
} from '@/logic/routing'

const EditFilePage = lazy(() => import('@/pages/EditFilePage'))
const FilePreviewPage = lazy(() => import('@/pages/FilePreviewPage'))
const FileGraphPage = lazy(() => import('@/pages/FileGraphPage'))
const GitDiffRoutePage = lazy(() => import('@/pages/GitDiffRoutePage'))
const SourceFilePage = lazy(() => import('@/pages/SourceFilePage'))
const WorkspaceGraphPage = lazy(() => import('@/pages/WorkspaceGraphPage'))
const WorkspaceHomePage = lazy(() => import('@/pages/WorkspaceHomePage'))

const lazyRoute = (Page: ComponentType) => (
  <Suspense fallback={<EditorPaneFallback />}>
    <Page />
  </Suspense>
)

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={lazyRoute(WorkspaceHomePage)} />
        <Route path={GIT_DIFF_ROUTE_PATTERN} element={lazyRoute(GitDiffRoutePage)} />
        <Route path={PREVIEW_ROUTE_PATTERN} element={lazyRoute(FilePreviewPage)} />
        <Route path={SOURCE_ROUTE_PATTERN} element={lazyRoute(SourceFilePage)} />
        <Route path={GRAPH_FILE_ROUTE_PATTERN} element={lazyRoute(FileGraphPage)} />
        <Route path={GRAPH_WORKSPACE_ROUTE_PATTERN} element={lazyRoute(WorkspaceGraphPage)} />
        <Route path={FILE_ROUTE_PATTERN} element={lazyRoute(EditFilePage)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </HashRouter>
)

export default App
