import { describe, expect, it, vi } from 'vitest'
import {
  GraphLayoutWorkerClient,
  type GraphLayoutEngineLike,
} from '@/logic/graphLayoutWorkerClient'
import type {
  GraphLayoutEngineResult,
  GraphLayoutWorkerGraph,
} from '@/logic/graphLayoutWorkerMessages'

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
