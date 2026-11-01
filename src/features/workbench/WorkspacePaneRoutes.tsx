import { lazy, Suspense } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import { WorkspaceNavigate as Navigate } from '@/features/workbench/WorkspaceNavigate'
import type { LayoutContextStore } from '@/app/AppLayoutContext'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import WorkspaceRootPage from '@/pages/WorkspaceRootPage'
import {
  ALL_PAGES_ROUTE_PATTERN,
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
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

export const WorkspacePaneRoutes = ({
  route,
  context,
}: {
  route: string
  context: LayoutContextStore
}) => (
  <Suspense fallback={<EditorPaneFallback />}>
    <Routes location={route}>
      <Route element={<Outlet context={context} />}>
        <Route index element={<WorkspaceRootPage />} />
        <Route path={ALL_PAGES_ROUTE_PATTERN} element={<AllPagesPage />} />
        <Route path={GIT_DIFF_ROUTE_PATTERN} element={<GitDiffRoutePage />} />
        <Route path={PREVIEW_ROUTE_PATTERN} element={<FilePreviewPage />} />
        <Route path={SOURCE_ROUTE_PATTERN} element={<SourceFilePage />} />
        <Route path={GRAPH_WORKSPACE_ROUTE_PATTERN} element={<WorkspaceGraphPage />} />
        <Route path={WEB_TAB_ROUTE_PATTERN} element={<WebTabPage />} />
        <Route path={FILE_ROUTE_PATTERN} element={<EditFilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </Suspense>
)
