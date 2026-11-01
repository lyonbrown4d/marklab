import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDockview, type DockviewApi } from 'dockview-react'
import { createDockController } from '@/features/workbench/dockController'
import { validateDockLayout, captureDockLayout } from '@/features/workbench/dockPersistence'

let api: DockviewApi
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  api = createDockview(document.createElement('div'), {
    disableAutoResizing: true,
    createComponent: () => ({ element: document.createElement('div'), init: () => undefined }),
  })
  api.layout(1000, 800)
})
afterEach(() => {
  api.dispose()
  vi.unstubAllGlobals()
})
const layout = () => {
  const controller = createDockController(api, () => ({ onClose: vi.fn() }))
  controller.open({ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' })
  controller.open(
    { id: 'b', route: '/files/edit/test.md', title: 'Test', kind: 'document' },
    { direction: 'below' },
  )
  return api.toJSON()
}

describe('workspace layout persistence boundary', () => {
  it('round trips real split sizes and descriptors, restores groups, and removes content and external windows', () => {
    const saved = layout()
    saved.panels.a.params!.editorContent = 'private document content'
    saved.popoutGroups = [
      { data: { id: 'external', views: ['a'] }, position: null, url: 'https://untrusted.invalid' },
    ]
    saved.floatingGroups = []
    const restored = captureDockLayout(saved)!
    expect(restored.grid).toEqual(saved.grid)
    expect(restored).not.toHaveProperty('popoutGroups')
    expect(restored.panels.a.params).toEqual({
      tab: { id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' },
    })
    api.fromJSON(validateDockLayout(restored)!)
    expect(api.groups).toHaveLength(2)
    expect(api.activePanel?.id).toBe('b')
  })

  it('restores active tabs in nested groups when another group contains multiple documents', () => {
    const controller = createDockController(api, () => ({ onClose: vi.fn() }))
    const alpha = {
      id: 'alpha',
      route: '/files/edit/Alpha.md',
      title: 'Alpha',
      kind: 'document',
    } as const
    const beta = {
      id: 'beta',
      route: '/files/edit/Beta.md',
      title: 'Beta',
      kind: 'document',
    } as const
    controller.open(alpha)
    controller.open({ ...alpha, id: 'alpha-copy' }, { referenceId: alpha.id, direction: 'right' })
    controller.open(beta, { referenceId: alpha.id, direction: 'within' })
    controller.open({ ...beta, id: 'beta-copy' }, { referenceId: beta.id, direction: 'below' })
    const betaGroup = controller.getGroupId(beta.id)
    const saved = captureDockLayout(api.toJSON())!
    expect(api.groups).toHaveLength(3)
    expect(api.activePanel?.id).toBe('beta-copy')
    expect(api.groups.find((group) => group.id === betaGroup)?.activePanel?.id).toBe(beta.id)

    api.clear()
    api.fromJSON(validateDockLayout(saved)!)

    expect(api.groups).toHaveLength(3)
    expect(api.activePanel?.id).toBe('beta-copy')
    expect(api.groups.find((group) => group.id === betaGroup)?.activePanel?.id).toBe(beta.id)
    expect(captureDockLayout(api.toJSON())).toEqual(saved)
  })

  it('rejects broken panel references, duplicate membership, and unbounded trees', () => {
    const saved = layout()
    const broken = structuredClone(saved)
    delete broken.panels.a
    expect(validateDockLayout(broken)).toBeUndefined()
    const duplicate = structuredClone(saved)
    duplicate.grid.root = {
      type: 'branch',
      data: [
        { type: 'leaf', data: { id: 'one', views: ['a', 'b'] } },
        { type: 'leaf', data: { id: 'two', views: ['a'] } },
      ],
    }
    expect(validateDockLayout(duplicate)).toBeUndefined()
    const deep = structuredClone(saved)
    for (let depth = 0; depth < 20; depth++)
      deep.grid.root = { type: 'branch', data: [deep.grid.root] }
    expect(validateDockLayout(deep)).toBeUndefined()
  })

  it.each(['/web/temporary', '/unavailable/page'])(
    'prunes unsupported route %s, repairs active metadata, and captures detached snapshots',
    (route) => {
      const saved = layout()
      saved.panels.b.params!.tab = { id: 'b', route, title: 'Web', kind: 'other' }
      const captured = captureDockLayout(saved)!
      expect(Object.keys(captured.panels)).toEqual(['a'])
      api.fromJSON(validateDockLayout(captured)!)
      expect(api.groups).toHaveLength(1)
      expect(api.activePanel?.id).toBe('a')
      expect(captured.activeGroup).toBe(api.activeGroup?.id)
      saved.panels.a.params!.tab.title = 'changed after capture'
      expect(captured.panels.a.params.tab.title).toBe('Graph')
      captured.panels.a.params.tab.route = '/web/last'
      const empty = captureDockLayout(captured)!
      expect(empty.panels).toEqual({})
      expect(empty.grid.root).toEqual({ type: 'branch', data: [] })
      expect(empty.activeGroup).toBeUndefined()
    },
  )
})
