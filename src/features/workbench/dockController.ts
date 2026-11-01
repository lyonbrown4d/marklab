import type { DockviewApi, IDockviewPanel } from 'dockview-react'
import {
  readDockTab,
  type DockOpenOptions,
  type DockTab,
  type WorkspaceDockHandle,
  type WorkspaceDockProps,
} from '@/features/workbench/dockTypes'

export type DockCloseScope = 'current' | 'others' | 'right' | 'all'
export interface DockController extends WorkspaceDockHandle {
  requestClose: (ids: string[]) => Promise<void>
  closeGroup: (id: string, scope: DockCloseScope) => void
  split: (id: string, direction: 'right' | 'below') => void
  move: (id: string, groupId: string) => void
  dispose: () => void
}

export const panelTab = (panel: IDockviewPanel | undefined): DockTab | undefined =>
  readDockTab(panel?.params?.tab)

export const groupCloseIds = (ids: string[], id: string, scope: DockCloseScope): string[] => {
  const index = ids.indexOf(id)
  if (index < 0) return []
  if (scope === 'current') return [id]
  if (scope === 'others') return ids.filter((candidate) => candidate !== id)
  if (scope === 'right') return ids.slice(index + 1)
  return ids
}

export const createDockController = (
  api: DockviewApi,
  getProps: () => Pick<WorkspaceDockProps, 'onBeforeClose' | 'onClose' | 'onError'>,
  onChanged?: () => void,
): DockController => {
  let disposed = false
  let queue = Promise.resolve()
  const pending = new Set<string>()
  const report = (error: unknown) => getProps().onError?.(error)
  const requestClose = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)].filter((id) => !pending.has(id))
    if (!uniqueIds.length) return Promise.resolve()
    uniqueIds.forEach((id) => pending.add(id))
    const operation = queue.then(async () => {
      try {
        for (const id of uniqueIds) {
          if (disposed) return
          const panel = api.getPanel(id)
          const tab = panelTab(panel)
          if (!panel || !tab) continue
          await getProps().onBeforeClose?.(tab)
          if (disposed || api.getPanel(id) !== panel) continue
          api.removePanel(panel)
          getProps().onClose(tab)
        }
      } finally {
        uniqueIds.forEach((id) => pending.delete(id))
      }
    })
    queue = operation.catch(report)
    return operation
  }
  const close = (id: string) => {
    void requestClose([id]).catch(() => undefined)
  }
  const reveal = (id: string) => {
    const panel = api.getPanel(id)
    if (!disposed && panel) panel.group.model.openPanel(panel, { skipSetGroupActive: true })
  }
  const open = (tab: DockTab, options: DockOpenOptions = {}) => {
    if (disposed) return
    const descriptor = readDockTab(tab)
    if (!descriptor) {
      report(new Error('Invalid workspace tab'))
      return
    }
    const existing = api.getPanel(tab.id)
    if (existing) {
      existing.api.updateParameters({ tab: descriptor })
      existing.api.setTitle(descriptor.title)
      if (options.activate !== false) existing.api.setActive()
      else if (options.reveal) reveal(existing.id)
      onChanged?.()
      return
    }
    if (api.panels.length >= 200) {
      report(new Error('Workspace tab limit reached'))
      return
    }
    const reference = options.referenceId
      ? api.getPanel(options.referenceId)
      : (api.activePanel ?? api.panels[0])
    const added = api.addPanel({
      id: descriptor.id,
      title: descriptor.title,
      component: 'workspace',
      params: { tab: descriptor },
      renderer: 'onlyWhenVisible',
      inactive: options.activate === false,
      minimumWidth: 160,
      minimumHeight: 120,
      ...(reference
        ? { position: { referencePanel: reference, direction: options.direction ?? 'within' } }
        : {}),
    })
    if (options.activate === false && options.reveal) reveal(added.id)
  }
  return {
    open,
    reveal,
    close,
    requestClose,
    activate: (id) => {
      if (!disposed) api.getPanel(id)?.api.setActive()
    },
    getTabs: () =>
      api.groups.flatMap((group) => group.panels.flatMap((panel) => panelTab(panel) ?? [])),
    getActiveTab: () => panelTab(api.activePanel),
    getGroupId: (id) => api.getPanel(id)?.group.id,
    closeGroup: (id, scope) => {
      const panel = api.getPanel(id)
      if (panel)
        void requestClose(
          groupCloseIds(
            panel.group.panels.map((item) => item.id),
            id,
            scope,
          ),
        ).catch(() => undefined)
    },
    split: (id, direction) => {
      const tab = panelTab(api.getPanel(id))
      if (tab) open({ ...tab, id: crypto.randomUUID() }, { referenceId: id, direction })
    },
    move: (id, groupId) => {
      const group = api.groups.find((candidate) => candidate.id === groupId)
      if (group && !disposed) api.getPanel(id)?.api.moveTo({ group, position: 'center' })
    },
    dispose: () => {
      disposed = true
    },
  }
}
