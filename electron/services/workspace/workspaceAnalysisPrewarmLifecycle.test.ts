import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceAnalysisPrewarmLifecycle } from '@electron/services/workspace/workspaceAnalysisPrewarmLifecycle'

const createHarness = () => {
  const graph = vi.fn<(context: { markStarted: () => void; signal: AbortSignal }) => Promise<void>>(
    async () => {},
  )
  const index = vi.fn(async () => {})
  const lifecycle = new WorkspaceAnalysisPrewarmLifecycle({
    canPrecomputeGraph: () => true,
    graphDelayMs: 10,
    indexDelayMs: 10,
    logger: { warn: vi.fn() },
    precomputeGraph: graph,
    precomputeIndex: index,
    setGraphStatus: vi.fn(),
  })
  return { graph, index, lifecycle }
}

afterEach(() => vi.useRealTimers())

describe('optional workspace analysis lifecycle', () => {
  it('prewarms the index after hydration without building an unused graph', async () => {
    vi.useFakeTimers()
    const { graph, index, lifecycle } = createHarness()
    lifecycle.markRendererInteractive()
    lifecycle.scheduleGraph()
    await vi.runAllTimersAsync()
    expect(index).toHaveBeenCalledOnce()
    expect(graph).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('cancels queued work in the background and resumes stale work once', async () => {
    vi.useFakeTimers()
    const { graph, index, lifecycle } = createHarness()
    lifecycle.markGraphRequested()
    lifecycle.markRendererInteractive()
    lifecycle.setWindowForeground(false)
    await vi.runAllTimersAsync()
    expect(graph).not.toHaveBeenCalled()
    expect(index).not.toHaveBeenCalled()
    lifecycle.setWindowForeground(true)
    lifecycle.setWindowForeground(true)
    await vi.runAllTimersAsync()
    expect(graph).toHaveBeenCalledOnce()
    expect(index).toHaveBeenCalledOnce()
    lifecycle.setWindowForeground(false)
    lifecycle.setWindowForeground(true)
    await vi.runAllTimersAsync()
    expect(graph).toHaveBeenCalledOnce()
    expect(index).toHaveBeenCalledOnce()
    lifecycle.dispose()
  })

  it('does not let an old completion hide a mutation made while backgrounded', async () => {
    vi.useFakeTimers()
    const { graph, lifecycle } = createHarness()
    let finish!: () => void
    graph.mockImplementationOnce(({ markStarted }) => {
      markStarted()
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    lifecycle.markGraphRequested()
    lifecycle.markRendererInteractive()
    await vi.advanceTimersByTimeAsync(10)
    expect(graph).toHaveBeenCalledOnce()
    lifecycle.setWindowForeground(false)
    lifecycle.scheduleGraph()
    finish()
    await vi.runAllTimersAsync()
    expect(graph).toHaveBeenCalledOnce()
    lifecycle.setWindowForeground(true)
    await vi.runAllTimersAsync()
    expect(graph).toHaveBeenCalledTimes(2)
    lifecycle.dispose()
  })

  it('aborts pre-start graph work when backgrounded and retries on focus', async () => {
    vi.useFakeTimers()
    const { graph, lifecycle } = createHarness()
    let signal!: AbortSignal
    graph.mockImplementationOnce((context) => {
      signal = context.signal
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    lifecycle.markGraphRequested()
    lifecycle.markRendererInteractive()
    await vi.advanceTimersByTimeAsync(10)
    lifecycle.setWindowForeground(false)
    expect(signal.aborted).toBe(true)
    await vi.runAllTimersAsync()
    lifecycle.setWindowForeground(true)
    await vi.runAllTimersAsync()
    expect(graph).toHaveBeenCalledTimes(2)
    lifecycle.dispose()
  })

  it('resets graph demand for a new root and removes pending work on dispose', async () => {
    vi.useFakeTimers()
    const { graph, index, lifecycle } = createHarness()
    lifecycle.markGraphRequested()
    lifecycle.markRendererInteractive()
    lifecycle.resetWorkspace()
    lifecycle.markRendererInteractive()
    await vi.runAllTimersAsync()
    expect(graph).not.toHaveBeenCalled()
    expect(index).toHaveBeenCalledOnce()
    lifecycle.markGraphRequested()
    lifecycle.scheduleGraph()
    lifecycle.dispose()
    await vi.runAllTimersAsync()
    expect(graph).not.toHaveBeenCalled()
  })
})
