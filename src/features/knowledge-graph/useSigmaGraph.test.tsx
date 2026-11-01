import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSigmaGraph } from '@/features/knowledge-graph/useSigmaGraph'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import type { KnowledgeGraphCanvasProps } from '@/features/knowledge-graph/types'

const state = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  updateContent: vi.fn(),
  select: vi.fn(),
  focus: vi.fn(),
}))
vi.mock('@/features/knowledge-graph/sigmaRenderer', () => ({ createSigmaRenderer: state.create }))
beforeEach(() => {
  vi.clearAllMocks()
  state.focus.mockReturnValue(true)
  state.create.mockImplementation(() => ({
    destroy: state.destroy,
    updateContent: state.updateContent,
    select: state.select,
    focus: state.focus,
  }))
})

describe('Sigma lifecycle hook', () => {
  it('updates same-topology content without rebuilding, and deallocates cached hidden routes', async () => {
    const container = document.createElement('div')
    const props: KnowledgeGraphCanvasProps = {
      graph: testGraph(),
      workspaceKey: 'workspace',
      active: true,
      onSelectNode: vi.fn(),
      onOpenNode: vi.fn(),
    }
    const hook = renderHook((current) => useSigmaGraph(container, current), { initialProps: props })
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce())
    const updated = testGraph()
    updated.revision = 'new-content'
    updated.nodes[0].position = { x: 123, y: 456 }
    hook.rerender({ ...props, graph: updated })
    expect(state.create).toHaveBeenCalledOnce()
    expect(state.updateContent).toHaveBeenLastCalledWith(updated)
    hook.rerender({ ...props, active: false })
    expect(state.destroy).toHaveBeenCalledOnce()
    expect(hook.result.current.renderer).toBeNull()
    hook.rerender(props)
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2))
    hook.unmount()
    expect(state.destroy).toHaveBeenCalledTimes(2)
  })
  it('retains unresolved focus and consumes only after successful renderer focus', async () => {
    const consumed = vi.fn()
    state.focus.mockReturnValue(false)
    const props: KnowledgeGraphCanvasProps = {
      graph: testGraph(),
      workspaceKey: 'workspace',
      onSelectNode: vi.fn(),
      onOpenNode: vi.fn(),
      focusRequest: { nodeId: 'absent' },
      onFocusConsumed: consumed,
    }
    const container = document.createElement('div')
    const hook = renderHook((current) => useSigmaGraph(container, current), { initialProps: props })
    await waitFor(() => expect(state.focus).toHaveBeenCalled())
    expect(consumed).not.toHaveBeenCalled()
    state.focus.mockReturnValue(true)
    hook.rerender({ ...props, focusRequest: { nodeId: 'file:a.md' } })
    await waitFor(() => expect(consumed).toHaveBeenCalled())
    hook.unmount()
  })
  it('exposes fallback when WebGL initialization fails', async () => {
    state.create.mockImplementation(() => {
      throw new Error('WebGL2 unavailable')
    })
    const container = document.createElement('div')
    const props: KnowledgeGraphCanvasProps = {
      graph: testGraph(),
      workspaceKey: 'workspace',
      onSelectNode: vi.fn(),
      onOpenNode: vi.fn(),
    }
    const hook = renderHook(() => useSigmaGraph(container, props))
    await act(async () => undefined)
    await waitFor(() => expect(hook.result.current.unavailable).toBe(true))
    expect(hook.result.current.renderer).toBeNull()
    hook.unmount()
  })
})
