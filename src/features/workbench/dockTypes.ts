import { createContext, type ReactNode } from 'react'
import type { DockviewApi, DockviewMessages } from 'dockview-react'
import type { DockController } from '@/features/workbench/dockController'

export interface DockTab {
  id: string
  route: string
  title: string
  kind: 'graph' | 'document' | 'other'
}

export interface DockOpenOptions {
  referenceId?: string
  direction?: 'within' | 'left' | 'right' | 'above' | 'below'
  activate?: boolean
  reveal?: boolean
}

export interface WorkspaceDockHandle {
  open: (tab: DockTab, options?: DockOpenOptions) => void
  activate: (id: string) => void
  reveal: (id: string) => void
  close: (id: string) => void
  getTabs: () => DockTab[]
  getActiveTab: () => DockTab | undefined
  getGroupId: (id: string) => string | undefined
}

export interface DockLabels {
  loadingLayout: string
  loadLayoutFailed: string
  saveLayoutFailed: string
  splitRight: string
  splitDown: string
  moveToGroup: string
  group: (index: number) => string
  close: string
  closeOthers: string
  closeRight: string
  closeAll: string
}

export interface WorkspaceDockProps {
  workspaceKey: string
  initialTabs: DockTab[]
  initialActiveId?: string
  labels: DockLabels
  messages?: Partial<DockviewMessages>
  renderPanel: (tab: DockTab, state: { active: boolean; visible: boolean }) => ReactNode
  onActivate: (tab: DockTab) => void
  onClose: (tab: DockTab) => void
  onTabsChanged: (tabs: DockTab[], visibleTabs: DockTab[]) => void
  /** Reject to cancel closing (for example, when saving a dirty document fails). */
  onBeforeClose?: (tab: DockTab) => Promise<void> | void
  onError?: (error: unknown) => void
  onReady?: (handle: WorkspaceDockHandle, state: { restored: boolean }) => void
}

export interface DockContextValue {
  props: WorkspaceDockProps
  api?: DockviewApi
  controller?: DockController
}

export const DockContext = createContext<DockContextValue | undefined>(undefined)

export const readDockTab = (value: unknown): DockTab | undefined => {
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    !record.id ||
    record.id.length > 256 ||
    typeof record.route !== 'string' ||
    !record.route ||
    !record.route.startsWith('/') ||
    record.route.startsWith('//') ||
    record.route.length > 8192 ||
    typeof record.title !== 'string' ||
    record.title.length > 1024 ||
    !['graph', 'document', 'other'].includes(String(record.kind))
  )
    return
  return {
    id: record.id,
    route: record.route,
    title: record.title,
    kind: record.kind as DockTab['kind'],
  }
}
