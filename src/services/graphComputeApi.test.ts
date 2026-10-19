import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { graphComputeApi, type GraphLayoutComputeInput } from '@/services/graphComputeApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: vi.fn() } }))
const input: GraphLayoutComputeInput = {
  mode: 'focus',
  nodes: [{ id: 'a', width: 240, height: 120 }],
  edges: [],
}
const result = {
  positions: [{ id: 'a', x: 10, y: 20 }],
  engineVersion: 'native-workspace-map-v1' as const,
}
const pendingNative = () => {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('graph computation IPC', () => {
  it('uses named commands, bounded inputs and a unique shared request identity per computation', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(result)
    await expect(graphComputeApi.layout(input)).resolves.toEqual(result)
    const layoutArgs = vi.mocked(invoke).mock.calls[0]?.[1]
    expect(invoke).toHaveBeenNthCalledWith(1, 'fs_compute_workspace_graph_layout', {
      ...input,
      requestId: expect.any(String),
    })
    const communityInput = { nodes: [{ id: 'a', label: 'A' }], edges: [] }
    const communities = { communities: [{ id: 'group-a', label: 'A', nodeIds: ['a'] }] }
    vi.mocked(invoke).mockResolvedValueOnce(communities)
    await expect(graphComputeApi.communities(communityInput)).resolves.toEqual(communities)
    expect(invoke).toHaveBeenNthCalledWith(2, 'fs_partition_workspace_graph', {
      ...communityInput,
      requestId: expect.any(String),
    })
    const communityArgs = vi.mocked(invoke).mock.calls[1]?.[1]
    expect(communityArgs?.requestId).not.toBe(layoutArgs?.requestId)
  })

  it('rejects accidental document payloads before crossing IPC', async () => {
    const withDocument = { ...input, nodes: [{ ...input.nodes[0]!, content: 'Private text' }] }
    await expect(graphComputeApi.layout(withDocument)).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['中文标题😀'.repeat(1_000), '👨‍👩‍👧‍👦'.repeat(200), `a${'́'.repeat(10_000)}`])(
    'keeps large topology and bounds Unicode display labels without changing source text',
    async (title) => {
      const nodes = Array.from({ length: 5_001 }, (_, index) => ({
        id: `n${index}`,
        label: index === 0 ? title : `Note ${index}`,
      }))
      vi.mocked(invoke).mockResolvedValueOnce({ communities: [] })
      await graphComputeApi.communities({ nodes, edges: [] })
      const payload = vi.mocked(invoke).mock.calls[0]?.[1] as {
        nodes: { id: string; label: string }[]
      }
      expect(payload.nodes).toHaveLength(5_001)
      expect(new TextEncoder().encode(payload.nodes[0]!.label).length).toBeLessThan(4_096)
      expect(title.startsWith(payload.nodes[0]!.label.slice(0, -3))).toBe(true)
      expect(nodes[0]!.label).toBe(title)
    },
  )

  it.each([
    { ...result, positions: [{ id: 'a', x: Number.POSITIVE_INFINITY, y: 20 }] },
    { ...result, positions: [{ id: 'a', x: 10 }] },
    { ...result, engineVersion: 'unexpected-engine' },
  ])('rejects incompatible native layout responses: %j', async (response) => {
    vi.mocked(invoke).mockResolvedValueOnce(response)
    await expect(graphComputeApi.layout(input)).rejects.toThrow()
  })

  it('validates partition results before exposing them to the renderer', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      communities: [{ id: 'a', label: 'A', nodeIds: [null] }],
    })
    await expect(graphComputeApi.communities({ nodes: [], edges: [] })).rejects.toThrow()
  })

  it('does not invoke either compute or cancel when the signal already aborted', async () => {
    await expect(graphComputeApi.layout(input, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(
      graphComputeApi.communities({ nodes: [], edges: [] }, AbortSignal.abort()),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects promptly on abort before native finishes and cancels the matching request once', async () => {
    const native = pendingNative()
    vi.mocked(invoke).mockReturnValueOnce(native.promise).mockResolvedValueOnce(undefined)
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const promise = graphComputeApi.layout(input, controller.signal)
    const outcome = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    const requestId = vi.mocked(invoke).mock.calls[0]?.[1]?.requestId
    controller.abort()
    controller.abort()
    await outcome
    expect(invoke).toHaveBeenNthCalledWith(2, 'fs_cancel_graph_computation', { requestId })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    // A late response remains consumed by the race, never restoring success after abort.
    native.resolve(result)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each(['success', 'failure'] as const)(
    'cleans the abort listener after native %s',
    async (outcome) => {
      const controller = new AbortController()
      const add = vi.spyOn(controller.signal, 'addEventListener')
      const remove = vi.spyOn(controller.signal, 'removeEventListener')
      const failure = new Error('native service unavailable')
      if (outcome === 'success') vi.mocked(invoke).mockResolvedValueOnce(result)
      else vi.mocked(invoke).mockRejectedValueOnce(failure)
      const promise = graphComputeApi.layout(input, controller.signal)
      if (outcome === 'success') await expect(promise).resolves.toEqual(result)
      else await expect(promise).rejects.toBe(failure)
      const listener = add.mock.calls.find(([event]) => event === 'abort')?.[1]
      expect(listener).toBeTypeOf('function')
      expect(remove).toHaveBeenCalledWith('abort', listener)
      controller.abort()
      expect(invoke).toHaveBeenCalledOnce()
    },
  )

  it('consumes late native rejection and reports cancel failure without replacing AbortError', async () => {
    const native = pendingNative()
    const cancelFailure = new Error('cancel failed')
    vi.mocked(invoke).mockReturnValueOnce(native.promise).mockRejectedValueOnce(cancelFailure)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const controller = new AbortController()
      const promise = graphComputeApi.layout(input, controller.signal)
      const outcome = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()
      await outcome
      native.reject(new Error('late native failure'))
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
      expect(rendererDiagnostics.warn).toHaveBeenCalledWith(
        'graph.compute',
        'cancel-failed',
        cancelFailure,
      )
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
