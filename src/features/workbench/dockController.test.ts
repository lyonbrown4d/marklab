import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDockview, type DockviewApi } from 'dockview-react'
import { createDockController, groupCloseIds } from '@/features/workbench/dockController'
import type { DockTab } from '@/features/workbench/dockTypes'

const tab = (id: string): DockTab => ({ id, route: '/file/shared.md', title: id, kind: 'document' })
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
    disableFloatingGroups: true,
    createComponent: () => ({ element: document.createElement('div'), init: () => undefined }),
  })
  api.layout(1000, 800)
})
afterEach(() => {
  api.dispose()
  vi.unstubAllGlobals()
})

describe('workspace docking controller', () => {
  it('keeps inactive startup tabs in one group before any group has focus', () => {
    const controller = createDockController(api, () => ({ onClose: vi.fn() }))
    controller.open(tab('a'), { activate: false })
    controller.open(tab('b'), { activate: false })
    expect(api.groups).toHaveLength(1)
    controller.activate('b')
    expect(controller.getActiveTab()?.id).toBe('b')
  })
  it('splits duplicate routes, moves existing panels, and preserves focus for inactive opens', () => {
    const controller = createDockController(api, () => ({ onClose: vi.fn() }))
    controller.open(tab('a'))
    controller.open(tab('b'), { activate: false })
    expect(controller.getActiveTab()?.id).toBe('a')
    controller.split('a', 'right')
    expect(api.groups).toHaveLength(2)
    expect(controller.getTabs().map((item) => item.route)).toEqual(Array(3).fill('/file/shared.md'))
    const duplicate = controller.getActiveTab()!
    expect(duplicate.id).not.toBe('a')
    const firstPanel = api.getPanel('a')!
    controller.move(duplicate.id, firstPanel.group.id)
    expect(api.getPanel(duplicate.id)?.group).toBe(firstPanel.group)
    expect(api.getPanel('a')).toBe(firstPanel)
    expect(api.groups).toHaveLength(1)
    controller.open({ ...tab('a'), title: 'renamed' }, { activate: false })
    expect(controller.getTabs().find((item) => item.id === 'a')?.title).toBe('renamed')
    expect(controller.getActiveTab()?.id).toBe(duplicate.id)
  })

  it('reveals successive document tabs within a passive group without moving graph focus', () => {
    const controller = createDockController(api, () => ({ onClose: vi.fn() }))
    controller.open({ ...tab('graph'), kind: 'graph', route: '/workspace/graph' })
    controller.open(tab('first'), {
      referenceId: 'graph',
      direction: 'right',
      activate: false,
      reveal: true,
    })
    controller.open(tab('second'), { referenceId: 'first', activate: false, reveal: true })
    expect(api.getPanel('second')?.api.isVisible).toBe(true)
    expect(api.getPanel('first')?.api.isVisible).toBe(false)
    expect(controller.getActiveTab()?.id).toBe('graph')
    controller.reveal('first')
    expect(api.getPanel('first')?.api.isVisible).toBe(true)
    expect(api.getPanel('second')?.api.isVisible).toBe(false)
    expect(controller.getActiveTab()?.id).toBe('graph')
    expect(api.groups).toHaveLength(2)
  })

  it('waits for the dirty-document barrier, deduplicates concurrent closes, and cancels after disposal', async () => {
    let finish: (() => void) | undefined
    const before = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const onClose = vi.fn()
    const controller = createDockController(api, () => ({ onBeforeClose: before, onClose }))
    controller.open(tab('a'))
    const closing = controller.requestClose(['a'])
    await Promise.resolve()
    expect(api.getPanel('a')).toBeDefined()
    await controller.requestClose(['a'])
    expect(before).toHaveBeenCalledTimes(1)
    finish?.()
    await closing
    expect(api.getPanel('a')).toBeUndefined()
    expect(onClose).toHaveBeenCalledWith(tab('a'))
    controller.open(tab('b'))
    const cancelled = controller.requestClose(['b'])
    await Promise.resolve()
    controller.dispose()
    finish?.()
    await cancelled
    expect(api.getPanel('b')).toBeDefined()
  })

  it('keeps tabs after a failed save and allows a later successful close', async () => {
    const failure = new Error('save failed')
    const onError = vi.fn()
    const onClose = vi.fn()
    const before = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
    const controller = createDockController(api, () => ({
      onBeforeClose: before,
      onClose,
      onError,
    }))
    controller.open(tab('a'))
    await expect(controller.requestClose(['a'])).rejects.toThrow('save failed')
    expect(api.getPanel('a')).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(failure)
    await controller.requestClose(['a'])
    expect(controller.getTabs()).toEqual([])
  })

  it('limits menu close actions to their source group and keeps ordered right-side semantics', async () => {
    const onClose = vi.fn()
    const controller = createDockController(api, () => ({ onClose }))
    controller.open(tab('a'))
    controller.open(tab('b'))
    controller.open(tab('c'))
    controller.open(tab('other'), { referenceId: 'a', direction: 'below' })
    const groupIds = api.getPanel('b')!.group.panels.map((panel) => panel.id)
    expect(groupCloseIds(groupIds, 'b', 'right')).toEqual(['c'])
    expect(groupCloseIds(groupIds, 'b', 'others')).toEqual(['a', 'c'])
    expect(groupCloseIds(groupIds, 'missing', 'all')).toEqual([])
    controller.closeGroup('b', 'all')
    await vi.waitFor(() => expect(controller.getTabs().map((item) => item.id)).toEqual(['other']))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
