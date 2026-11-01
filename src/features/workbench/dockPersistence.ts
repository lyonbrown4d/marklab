import { Orientation, type SerializedDockview } from 'dockview-react'
import { readDockTab } from '@/features/workbench/dockTypes'
import type { WorkspaceLayout } from '@/services/workspaceLayoutApi'

const MAX_BYTES = 512_000
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finiteSize = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256

/** Rebuild only supported grid/tab metadata; never restore editor content or external windows. */
export const validateDockLayout = (value: unknown): SerializedDockview | undefined => {
  if (!isRecord(value) || !isRecord(value.grid) || !isRecord(value.panels)) return
  const { grid } = value
  if (
    !finiteSize(grid.width) ||
    !finiteSize(grid.height) ||
    ![Orientation.HORIZONTAL, Orientation.VERTICAL].includes(grid.orientation as Orientation)
  )
    return
  const entries = Object.entries(value.panels)
  if (entries.length > 200) return
  const panels: SerializedDockview['panels'] = Object.create(null)
  for (const [id, raw] of entries) {
    if (!safeId(id) || !isRecord(raw) || !isRecord(raw.params)) return
    const tab = readDockTab(raw.params.tab)
    if (!tab || tab.id !== id || raw.id !== id || raw.contentComponent !== 'workspace') return
    panels[id] = {
      id,
      contentComponent: 'workspace',
      title: tab.title,
      params: { tab },
      renderer: 'onlyWhenVisible',
    }
  }
  const used = new Set<string>()
  const groups = new Set<string>()
  let nodes = 0
  const walk = (raw: unknown, depth: number): SerializedDockview['grid']['root'] | undefined => {
    if (
      !isRecord(raw) ||
      depth > 16 ||
      ++nodes > 128 ||
      (raw.size !== undefined && !finiteSize(raw.size))
    )
      return
    const size = typeof raw.size === 'number' ? raw.size : undefined
    if (raw.type === 'branch' && Array.isArray(raw.data)) {
      if (raw.data.length > 64) return
      const children = raw.data.map((child) => walk(child, depth + 1))
      if (children.some((child) => !child)) return
      return { type: 'branch', data: children as SerializedDockview['grid']['root'][], size }
    }
    if (raw.type !== 'leaf' || !isRecord(raw.data)) return
    const data = raw.data
    if (
      !safeId(data.id) ||
      groups.has(data.id) ||
      !Array.isArray(data.views) ||
      !data.views.length ||
      groups.size >= 64
    )
      return
    groups.add(data.id)
    const views: string[] = []
    for (const id of data.views) {
      if (!safeId(id) || !panels[id] || used.has(id)) return
      used.add(id)
      views.push(id)
    }
    const activeView =
      typeof data.activeView === 'string' && views.includes(data.activeView)
        ? data.activeView
        : views[0]
    return { type: 'leaf', data: { id: data.id, views, activeView }, size }
  }
  const root = walk(grid.root, 0)
  if (!root || used.size !== entries.length) return
  const normalized: SerializedDockview = {
    grid: {
      root,
      width: grid.width as number,
      height: grid.height as number,
      orientation: grid.orientation as Orientation,
    },
    panels,
    ...(typeof value.activeGroup === 'string' && groups.has(value.activeGroup)
      ? { activeGroup: value.activeGroup }
      : {}),
  }
  return new TextEncoder().encode(JSON.stringify(normalized)).length <= MAX_BYTES
    ? normalized
    : undefined
}

// Only routes supported by the native persistence contract belong in a saved workspace.
const persistableRoute = (route: string) => {
  const path = route.split(/[?#]/, 1)[0]
  return (
    ['/', '/workspace/pages', '/workspace/graph'].includes(path) ||
    /^\/files\/(edit|source|preview)\/.+$/.test(path) ||
    /^\/_diff\/(staged|unstaged|untracked|conflicts)\/.+$/.test(path)
  )
}

/** Capture detached metadata, pruning routes outside the native restore contract. */
export const captureDockLayout = (value: unknown): WorkspaceLayout | undefined => {
  const normalized = validateDockLayout(value)
  if (!normalized) return
  const panels: WorkspaceLayout['panels'] = Object.create(null)
  for (const [id, panel] of Object.entries(normalized.panels)) {
    const tab = readDockTab(panel.params?.tab)
    if (!tab || !persistableRoute(tab.route)) continue
    panels[id] = {
      id,
      title: tab.title,
      contentComponent: 'workspace',
      renderer: 'onlyWhenVisible',
      params: { tab },
    }
  }
  const groups = new Set<string>()
  type Node = WorkspaceLayout['grid']['root']
  const prune = (node: SerializedDockview['grid']['root']): Node | undefined => {
    if (Array.isArray(node.data)) {
      const data = node.data.flatMap((child) => {
        const next = prune(child)
        return next ? [next] : []
      })
      return data.length ? { type: 'branch', data, size: node.size } : undefined
    }
    const views = node.data.views.filter((id) => panels[id])
    if (!views.length) return
    groups.add(node.data.id)
    const activeView = node.data.activeView
    return {
      type: 'leaf',
      size: node.size,
      data: {
        id: node.data.id,
        views,
        activeView: activeView && views.includes(activeView) ? activeView : views[0],
      },
    }
  }
  const root = prune(normalized.grid.root) ?? { type: 'branch', data: [] }
  const activeGroup = groups.has(normalized.activeGroup ?? '')
    ? normalized.activeGroup
    : groups.values().next().value
  const layout: WorkspaceLayout = {
    grid: { ...normalized.grid, root },
    panels,
    ...(activeGroup ? { activeGroup } : {}),
  }
  return new TextEncoder().encode(JSON.stringify(layout)).length <= MAX_BYTES ? layout : undefined
}
