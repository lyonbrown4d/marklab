import { lazy, Suspense, type ComponentType } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import WorkspaceRootPage from '@/pages/WorkspaceRootPage'
import {
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  ALL_PAGES_ROUTE_PATTERN,
  PREVIEW_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
  WEB_TAB_ROUTE_PATTERN,
} from '@/logic/routing'

const AllPagesPage = lazy(() => import('@/pages/AllPagesPage'))
const EditFilePage = lazy(() => import('@/pages/EditFilePage'))
const FilePreviewPage = lazy(() => import('@/pages/FilePreviewPage'))
const GitDiffRoutePage = lazy(() => import('@/pages/GitDiffRoutePage'))
const SourceFilePage = lazy(() => import('@/pages/SourceFilePage'))
const WorkspaceGraphPage = lazy(() => import('@/pages/WorkspaceGraphPage'))
const WebTabPage = lazy(() => import('@/pages/WebTabPage'))

const lazyRoute = (Page: ComponentType) => (
  <Suspense fallback={<EditorPaneFallback />}>
    <Page />
  </Suspense>
)

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<WorkspaceRootPage />} />
        <Route path={ALL_PAGES_ROUTE_PATTERN} element={lazyRoute(AllPagesPage)} />
        <Route path={GIT_DIFF_ROUTE_PATTERN} element={lazyRoute(GitDiffRoutePage)} />
        <Route path={PREVIEW_ROUTE_PATTERN} element={lazyRoute(FilePreviewPage)} />
        <Route path={SOURCE_ROUTE_PATTERN} element={lazyRoute(SourceFilePage)} />
        <Route path={GRAPH_WORKSPACE_ROUTE_PATTERN} element={lazyRoute(WorkspaceGraphPage)} />
        <Route path={WEB_TAB_ROUTE_PATTERN} element={lazyRoute(WebTabPage)} />
        <Route path={FILE_ROUTE_PATTERN} element={lazyRoute(EditFilePage)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </HashRouter>
)

export default App
