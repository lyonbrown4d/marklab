import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GraphLayoutWorkerClient,
  type GraphLayoutEngineLike,
} from '@/logic/graphLayoutWorkerClient'
import type {
  GraphLayoutEngineResult,
  GraphLayoutWorkerGraph,
} from '@/logic/graphLayoutWorkerMessages'

vi.mock('elkjs/lib/elk-worker.min.js?url', () => ({ default: 'test-elk-worker.js' }))

class FakeEngine implements GraphLayoutEngineLike {
  private readonly rejects: Array<(error: Error) => void> = []
  private readonly resolves: Array<(result: GraphLayoutEngineResult) => void> = []
  readonly layout = vi.fn(
    (graph: GraphLayoutWorkerGraph) =>
      new Promise<GraphLayoutEngineResult>((resolve, reject) => {
        this.resolves.push(resolve)
        this.rejects.push(reject)
        void graph
      }),
  )
  readonly terminateWorker = vi.fn()

  resolve(index: number, result: GraphLayoutEngineResult) {
    this.resolves[index]?.(result)
  }

  reject(index: number, error: Error) {
    this.rejects[index]?.(error)
  }
}

const graph: GraphLayoutWorkerGraph = {
  id: 'root',
  children: [{ id: 'one', width: 100, height: 50 }],
  edges: [],
  layoutOptions: {},
}

describe('GraphLayoutWorkerClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('expires warmup and completed workers after one idle interval', async () => {
    const first = new FakeEngine()
    const second = new FakeEngine()
    const createEngine = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const client = new GraphLayoutWorkerClient(createEngine)
    client.warmup()
    await vi.advanceTimersByTimeAsync(20_000)
    client.warmup()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(first.terminateWorker).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(first.terminateWorker).toHaveBeenCalledOnce()

    const result = client.layout(graph)
    second.resolve(0, { ...graph, children: [] })
    await expect(result).resolves.toEqual([])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(second.terminateWorker).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never expires overlapping work and restarts idle time after the final result', async () => {
    const engine = new FakeEngine()
    const client = new GraphLayoutWorkerClient(() => engine)
    client.warmup()
    await vi.advanceTimersByTimeAsync(29_000)
    const first = client.layout(graph)
    const second = client.layout(graph)
    engine.resolve(0, { ...graph, children: [] })
    await first
    client.warmup()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(engine.terminateWorker).not.toHaveBeenCalled()
    engine.resolve(1, { ...graph, children: [] })
    await second
    await vi.advanceTimersByTimeAsync(29_999)
    expect(engine.terminateWorker).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.terminateWorker).toHaveBeenCalledOnce()
  })

  it('clears idle timers on manual termination and expires failed layouts', async () => {
    const engine = new FakeEngine()
    const client = new GraphLayoutWorkerClient(() => engine)
    client.warmup()
    client.terminate()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(engine.terminateWorker).toHaveBeenCalledOnce()

    const result = client.layout(graph)
    const rejected = expect(result).rejects.toThrow('failed')
    engine.reject(0, new Error('failed'))
    await rejected
    await vi.advanceTimersByTimeAsync(30_000)
    expect(engine.terminateWorker).toHaveBeenCalledTimes(2)
  })

  it('ignores stale results and fatal events after cancellation replaces an engine', async () => {
    const first = new FakeEngine()
    const second = new FakeEngine()
    const handlers: Array<(error: Error) => void> = []
    const createEngine = vi.fn((handler: (error: Error) => void) => {
      handlers.push(handler)
      return handlers.length === 1 ? first : second
    })
    const client = new GraphLayoutWorkerClient(createEngine)
    const controller = new AbortController()
    const cancelled = client.layout(graph, controller.signal)
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    const current = client.layout(graph)
    first.resolve(0, { ...graph, children: [] })
    handlers[0]?.(new Error('late failure'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(first.terminateWorker).toHaveBeenCalledOnce()
    expect(second.terminateWorker).not.toHaveBeenCalled()
    second.resolve(0, { ...graph, children: [] })
    await expect(current).resolves.toEqual([])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(second.terminateWorker).toHaveBeenCalledOnce()
  })

  it('releases synchronous layout failures without keeping the engine busy forever', async () => {
    const engine = new FakeEngine()
    engine.layout.mockImplementationOnce(() => {
      throw new Error('synchronous failure')
    })
    const client = new GraphLayoutWorkerClient(() => engine)
    await expect(client.layout(graph)).rejects.toThrow('synchronous failure')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(engine.terminateWorker).toHaveBeenCalledOnce()
  })

  it('starts the official ELK worker proxy during feature warmup', () => {
    const engine = new FakeEngine()
    const createEngine = vi.fn(() => engine)
    const client = new GraphLayoutWorkerClient(createEngine)

    client.warmup()

    expect(createEngine).toHaveBeenCalledOnce()
    expect(engine.layout).not.toHaveBeenCalled()
  })

  it('converts the official ELK result to typed node positions', async () => {
    const engine = new FakeEngine()
    const client = new GraphLayoutWorkerClient(() => engine)
    const result = client.layout(graph)

    expect(engine.layout).toHaveBeenCalledWith(graph)
    engine.resolve(0, {
      ...graph,
      children: [{ ...graph.children[0]!, x: 24, y: 48 }],
    })

    await expect(result).resolves.toEqual([{ id: 'one', x: 24, y: 48 }])
  })

  it('terminates an obsolete ELK engine and runs the next layout on a fresh engine', async () => {
    const firstEngine = new FakeEngine()
    const secondEngine = new FakeEngine()
    const createEngine = vi
      .fn<() => GraphLayoutEngineLike>()
      .mockReturnValueOnce(firstEngine)
      .mockReturnValueOnce(secondEngine)
    const client = new GraphLayoutWorkerClient(createEngine)
    const controller = new AbortController()
    const result = client.layout(graph, controller.signal)

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstEngine.terminateWorker).toHaveBeenCalledOnce()

    const nextResult = client.layout(graph)
    secondEngine.resolve(0, {
      ...graph,
      children: [{ ...graph.children[0]!, x: 100, y: 200 }],
    })

    await expect(nextResult).resolves.toEqual([{ id: 'one', x: 100, y: 200 }])
    expect(createEngine).toHaveBeenCalledTimes(2)
  })

  it('rejects every pending task when cancellation restarts their shared engine', async () => {
    const engine = new FakeEngine()
    const client = new GraphLayoutWorkerClient(() => engine)
    const controller = new AbortController()
    const cancelledResult = client.layout(graph, controller.signal)
    const affectedResult = client.layout(graph)
    const cancelledExpectation = expect(cancelledResult).rejects.toMatchObject({
      name: 'AbortError',
    })
    const affectedExpectation = expect(affectedResult).rejects.toThrow(
      'Graph layout worker restarted after cancellation.',
    )

    controller.abort()

    await cancelledExpectation
    await affectedExpectation
    expect(engine.terminateWorker).toHaveBeenCalledOnce()
  })

  it('rejects an ELK layout error without stranding later requests', async () => {
    const engine = new FakeEngine()
    const createEngine = vi.fn(() => engine)
    const client = new GraphLayoutWorkerClient(createEngine)
    const firstResult = client.layout(graph)
    const error = new Error('layout failed')

    engine.reject(0, error)

    await expect(firstResult).rejects.toBe(error)
    const nextResult = client.layout(graph)
    engine.resolve(1, { ...graph, children: [{ ...graph.children[0]!, x: 8, y: 16 }] })
    await expect(nextResult).resolves.toEqual([{ id: 'one', x: 8, y: 16 }])
    expect(createEngine).toHaveBeenCalledOnce()
  })

  it('rejects pending layouts and creates a fresh engine after a fatal worker error', async () => {
    const firstEngine = new FakeEngine()
    const secondEngine = new FakeEngine()
    const fatalHandlers: Array<(error: Error) => void> = []
    const createEngine = vi
      .fn<(onFatalError: (error: Error) => void) => GraphLayoutEngineLike>()
      .mockImplementationOnce((onFatalError) => {
        fatalHandlers.push(onFatalError)
        return firstEngine
      })
      .mockImplementationOnce((onFatalError) => {
        fatalHandlers.push(onFatalError)
        return secondEngine
      })
    const client = new GraphLayoutWorkerClient(createEngine)
    const firstResult = client.layout(graph)
    const error = new Error('worker crashed')

    fatalHandlers[0]?.(error)

    await expect(firstResult).rejects.toBe(error)
    expect(firstEngine.terminateWorker).toHaveBeenCalledOnce()

    const retryResult = client.layout(graph)
    secondEngine.resolve(0, {
      ...graph,
      children: [{ ...graph.children[0]!, x: 32, y: 64 }],
    })
    await expect(retryResult).resolves.toEqual([{ id: 'one', x: 32, y: 64 }])
    expect(createEngine).toHaveBeenCalledTimes(2)
  })
})
