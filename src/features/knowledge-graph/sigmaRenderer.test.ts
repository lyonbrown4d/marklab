import { describe, expect, it, vi } from 'vitest'
import { mocks, setup } from '@/features/knowledge-graph/sigmaRendererTestSetup'
import { graphViewCache } from '@/features/knowledge-graph/graphViewCache'
import { testExternalGraphNode, testGraph } from '@/features/knowledge-graph/testGraph'

describe('Sigma4 graph renderer integration', () => {
  it('redraws positive container sizes without resetting graph state and ignores hidden or retired views', () => {
    const container = document.createElement('div')
    let width = 640
    let height = 480
    Object.defineProperties(container, {
      offsetWidth: { get: () => width },
      offsetHeight: { get: () => height },
    })
    const { renderer } = setup(testGraph(), 'workspace', container)
    renderer.select('file:b.md')
    renderer.focus({ nodeId: 'file:b.md', viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 } })
    mocks.graph?.setNodeAttribute('file:b.md', 'x', 42)
    mocks.events.get('nodeDragEnd')?.({ node: 'file:b.md', allDraggedNodes: [] } as never)
    const graph = mocks.graph
    for (const nextWidth of [640, 320, 900]) {
      width = nextWidth
      mocks.resizeCallback()
    }
    expect(mocks.scheduleRender).toHaveBeenCalledTimes(3)
    expect(mocks.resize).not.toHaveBeenCalled()
    expect(mocks.graph).toBe(graph)
    expect(graph?.getNodeAttribute('file:b.md', 'x')).toBe(42)
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    expect(mocks.options?.nodeReducer('missing:c.md', { size: 3 }).opacity).toBe(0.2)
    width = 0
    mocks.resizeCallback()
    width = 640
    height = 0
    mocks.resizeCallback()
    expect(mocks.scheduleRender).toHaveBeenCalledTimes(3)
    height = 480
    mocks.resizeCallback()
    expect(mocks.scheduleRender).toHaveBeenCalledTimes(4)
    renderer.destroy()
    mocks.resizeCallback()
    expect(mocks.scheduleRender).toHaveBeenCalledTimes(4)
  })
  it('seeds coordinates immediately, settles a finite worker, persists the computed layout and releases resources', () => {
    const { renderer } = setup()
    expect(mocks.options?.settings.enableNodeDrag).toBe(true)
    expect(mocks.options?.settings.itemSizesReference).toBe('screen')
    expect(mocks.options?.primitives.nodes.layers[0].drawingMode).toBe('color')
    const seeded = { ...mocks.graph?.getNodeAttributes('file:b.md') }
    expect(Number.isFinite(seeded.x) && Number.isFinite(seeded.y)).toBe(true)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'iconKind')).toBe('markdown')
    mocks.refresh.mockClear()
    vi.advanceTimersByTime(3000)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject(seeded)
    expect(mocks.workers[0].kill).toHaveBeenCalledOnce()
    expect(Object.keys(graphViewCache.getState().entries[0].positions)).toHaveLength(3)
    renderer.zoom(0.5)
    renderer.destroy()
    renderer.destroy()
    expect(mocks.kill).toHaveBeenCalledOnce()
    expect(mocks.wheelEvents.size).toBe(0)
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      topologyKey: 'topology-1',
      layoutPending: false,
      manualOverrides: {},
      camera: mocks.camera,
    })
    expect(graphViewCache.getState().entries[0].camera.ratio).toBe(0.5)
    const restored = setup()
    expect(mocks.workers).toHaveLength(1)
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject(seeded)
    expect(mocks.camera.ratio).toBe(0.5)
    restored.renderer.destroy()
  })
  it('resumes unfinished force layouts after camera saves, fitting and rapid close instead of caching seeds as settled', () => {
    const { renderer } = setup()
    renderer.zoom(0.7)
    vi.advanceTimersByTime(250)
    expect(graphViewCache.getState().entries[0].layoutPending).toBe(true)
    renderer.fit()
    expect(mocks.workers[0].kill).not.toHaveBeenCalled()
    expect(graphViewCache.getState().entries[0].layoutPending).toBe(true)
    renderer.zoom(0.6)
    renderer.destroy()
    expect(graphViewCache.getState().entries[0].layoutPending).toBe(true)
    expect(mocks.workers[0].kill).toHaveBeenCalledOnce()
    const resumed = setup()
    expect(mocks.workers).toHaveLength(2)
    expect(mocks.camera.ratio).toBe(0.6)
    mocks.workers[1].graph.mergeNodeAttributes('file:b.md', { x: 80, y: 90 })
    vi.advanceTimersByTime(3000)
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      layoutPending: false,
      positions: { 'file:b.md': { x: 80, y: 90 } },
    })
    resumed.renderer.destroy()
  })
  it('persists an explicit fit even when the camera is already at its default position', () => {
    const { renderer, onCameraChange } = setup()
    expect(graphViewCache.getState().entries).toEqual([])
    renderer.fit()
    expect(onCameraChange).not.toHaveBeenCalled()
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      manualOverrides: {},
      camera: mocks.camera,
    })
    renderer.destroy()
  })
  it('retains computed and manual positions on content updates, then explicitly rearranges without moving the camera', () => {
    const { renderer } = setup()
    renderer.focus({ nodeId: 'file:a.md', viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 } })
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    mocks.graph?.setNodeAttribute('file:a.md', 'y', 0)
    mocks.graph?.setNodeAttribute('file:b.md', 'x', 999)
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({
      'file:a.md': { x: 42, y: 0 },
    })
    const updated = testGraph()
    updated.nodes[0].label = 'Renamed'
    if (updated.nodes[0].kind === 'file') updated.nodes[0].path = 'assets/renamed.png'
    renderer.updateContent(updated)
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject({
      x: 42,
      y: 0,
      label: 'Renamed',
      iconKind: 'image',
    })
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject({ x: 999 })
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    renderer.arrange()
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).not.toBe(42)
    const arranged = { ...mocks.graph?.getNodeAttributes('file:a.md') }
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({})
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    renderer.destroy()
    const restored = setup(updated)
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject(arranged)
    expect(mocks.camera.ratio).toBe(0.6)
    restored.renderer.destroy()
  })
  it('retains manual positions across topology changes, prunes removed nodes, and isolates workspace and document views', () => {
    const initial = setup()
    initial.renderer.focus({
      nodeId: 'file:a.md',
      viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 },
    })
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    initial.renderer.destroy()
    const updated = testGraph()
    updated.nodes.push(testExternalGraphNode())
    const changed = setup({ ...updated, topology_key: 'topology-2' })
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    expect(mocks.graph?.hasNode(testExternalGraphNode().id)).toBe(true)
    expect(Number.isFinite(mocks.graph?.getNodeAttribute(testExternalGraphNode().id, 'x'))).toBe(
      true,
    )
    changed.renderer.destroy()
    const local = setup(testGraph(), 'document:a.md')
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).not.toBe(42)
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    local.renderer.destroy()
    const removed = testGraph()
    removed.nodes = removed.nodes.slice(1)
    const remaining = setup(removed)
    remaining.renderer.destroy()
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({})
  })
  it('saves layout changes immediately, clears explicit overrides, and restores kind and positions on reopen', () => {
    const { renderer } = setup()
    mocks.events.get('nodeDragStart')?.()
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    mocks.events.get('nodeDragEnd')?.({ node: 'file:a.md', allDraggedNodes: [] } as never)
    renderer.zoom(0.5)
    renderer.arrange('circular')
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      layout: 'circular',
      manualOverrides: {},
      camera: { ratio: 1 },
    })
    renderer.arrange('grouped')
    const snapshot = graphViewCache.getState().entries[0]
    expect(snapshot.layout).toBe('grouped')
    renderer.destroy()
    const restored = setup()
    expect(mocks.workers).toHaveLength(1)
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject(
      snapshot.positions['file:a.md'],
    )
    restored.renderer.arrange()
    expect(graphViewCache.getState().entries[0].layout).toBe('grouped')
    expect(mocks.workers).toHaveLength(1)
    restored.renderer.destroy()
  })
  it('selects without opening, opens on double click and dims unrelated nodes', () => {
    const { renderer, onSelectNode, onOpenNode } = setup()
    mocks.events.get('clickNode')?.({ node: 'file:b.md' } as never)
    expect(onSelectNode).toHaveBeenCalledWith('file:b.md')
    expect(onOpenNode).not.toHaveBeenCalled()
    mocks.events.get('clickStage')?.()
    expect(onSelectNode).toHaveBeenLastCalledWith(null)
    const preventSigmaDefault = vi.fn()
    mocks.events.get('doubleClickNode')?.({
      node: 'file:b.md',
      event: { preventSigmaDefault },
    } as never)
    expect(onOpenNode).toHaveBeenCalledWith('file:b.md')
    expect(preventSigmaDefault).toHaveBeenCalledOnce()
    renderer.select('file:b.md')
    expect(mocks.options?.nodeReducer('missing:c.md', { size: 3 }).opacity).toBe(0.2)
    expect(mocks.options?.nodeReducer('file:a.md', { size: 5 }).opacity).toBe(1)
    expect(mocks.options?.edgeReducer('a-c').opacity).toBe(0.1)
    renderer.select(null)
    expect(mocks.options?.nodeReducer('missing:c.md', { size: 3 }).opacity).toBe(1)
    expect(renderer.focus({ nodeId: 'absent' })).toBe(false)
    renderer.destroy()
  })
  it('retains focus, drag, camera controls and theme colors with icon nodes', async () => {
    const { renderer, onCameraChange } = setup()
    renderer.select('file:a.md')
    renderer.focus({ nodeId: 'a.md' })
    expect(mocks.camera).toMatchObject({ x: 0.2, y: 0.3, ratio: 0.35 })
    renderer.fit()
    renderer.zoom(0.5)
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 0.5 })
    expect(onCameraChange).toHaveBeenLastCalledWith(mocks.camera)
    vi.advanceTimersByTime(250)
    expect(graphViewCache.getState().entries[0].camera.ratio).toBe(0.5)
    renderer.arrange()
    mocks.events.get('nodeDragStart')?.()
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 9)
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    expect(graphViewCache.getState().entries[0].manualOverrides['file:a.md'].x).toBe(9)
    const previousPrimary = document.documentElement.style.getPropertyValue('--primary')
    document.documentElement.style.setProperty('--primary', '0 100% 50%')
    await Promise.resolve()
    expect(mocks.options?.nodeReducer('file:a.md', { size: 10 })).toMatchObject({
      color: 'rgb(255, 0, 0)',
    })
    renderer.focus({ nodeId: 'workspace' })
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    renderer.destroy()
    document.documentElement.style.setProperty('--primary', previousPrimary)
    renderer.zoom(2)
    renderer.fit()
    renderer.select('file:a.md')
    renderer.updateContent(testGraph())
    expect(renderer.focus({ nodeId: 'workspace' })).toBe(false)
    expect(mocks.camera.ratio).toBe(1)
  })
})
