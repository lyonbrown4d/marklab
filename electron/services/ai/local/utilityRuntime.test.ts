import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { UtilityLocalAiRuntime } from '@electron/services/ai/local/utilityRuntime.js'
import type { LocalAiGenerationEvent } from '@electron/services/ai/local/types.js'

describe('UtilityLocalAiRuntime', () => {
  it('lazily forks the isolated process and forwards streaming events', async () => {
    const child = new FakeUtilityProcess()
    const fork = vi.fn(() => child)
    const runtime = new UtilityLocalAiRuntime({
      entryPath: 'local-ai.js',
      fork,
      idleTimeoutMs: 100,
    })
    const events: LocalAiGenerationEvent[] = []
    const pending = runtime.generate(request(), (event) => events.push(event))
    await Promise.resolve()
    expect(fork).toHaveBeenCalledOnce()
    child.emit('spawn')
    await waitFor(() => child.postMessage.mock.calls.length > 0)
    expect(child.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'generate' }))
    child.emit('message', { type: 'event', event: { requestId: 'r1', type: 'delta', delta: '你' } })
    child.emit('message', {
      type: 'event',
      event: {
        requestId: 'r1',
        type: 'finish',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      },
    })

    await pending
    expect(events.map((event) => event.type)).toEqual(['delta', 'finish'])
  })

  it('sends cancellation to the isolated process', async () => {
    const child = new FakeUtilityProcess()
    const runtime = new UtilityLocalAiRuntime({ entryPath: 'local-ai.js', fork: () => child })
    const pending = runtime.generate(request(), vi.fn())
    child.emit('spawn')
    await waitFor(() => child.postMessage.mock.calls.length > 0)

    await runtime.cancel('r1')

    expect(child.postMessage).toHaveBeenCalledWith({ type: 'cancel', requestId: 'r1' })
    child.emit('message', { type: 'event', event: { requestId: 'r1', type: 'cancelled' } })
    await pending
  })

  it('normalizes a utility-process crash for pending requests', async () => {
    const child = new FakeUtilityProcess()
    const events: LocalAiGenerationEvent[] = []
    const runtime = new UtilityLocalAiRuntime({ entryPath: 'local-ai.js', fork: () => child })
    const pending = runtime.generate(request(), (event) => events.push(event))
    child.emit('spawn')
    await waitFor(() => child.postMessage.mock.calls.length > 0)

    child.emit('exit', 9)
    await pending

    expect(runtime.getStatus()).toBe('error')
    expect(events).toEqual([
      { requestId: 'r1', type: 'error', message: 'Local AI runtime exited unexpectedly' },
    ])
  })

  it('unloads the utility process after the idle timeout', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeUtilityProcess()
      const runtime = new UtilityLocalAiRuntime({
        entryPath: 'local-ai.js',
        fork: () => child,
        idleTimeoutMs: 50,
      })
      const pending = runtime.generate(request(), vi.fn())
      child.emit('spawn')
      await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalled())
      child.emit('message', { type: 'event', event: { requestId: 'r1', type: 'cancelled' } })
      await pending

      await vi.advanceTimersByTimeAsync(50)

      expect(child.postMessage).toHaveBeenCalledWith({ type: 'shutdown' })
      child.emit('exit', 0)
      await Promise.resolve()
      expect(child.kill).not.toHaveBeenCalled()
      expect(runtime.getStatus()).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for utility exit before completing disposal', async () => {
    const child = new FakeUtilityProcess()
    const runtime = new UtilityLocalAiRuntime({ entryPath: 'local-ai.js', fork: () => child })
    const pending = runtime.generate(request(), vi.fn())
    child.emit('spawn')
    await waitFor(() => child.postMessage.mock.calls.length > 0)
    child.emit('message', { type: 'event', event: { requestId: 'r1', type: 'cancelled' } })
    await pending
    let disposed = false

    const disposing = runtime.dispose().then(() => {
      disposed = true
    })
    await waitFor(() =>
      child.postMessage.mock.calls.some(([message]) => message.type === 'shutdown'),
    )
    expect(disposed).toBe(false)
    child.emit('exit', 0)
    await disposing

    expect(disposed).toBe(true)
  })
})

class FakeUtilityProcess extends EventEmitter {
  postMessage = vi.fn()
  kill = vi.fn(() => true)
}

const request = () => ({ requestId: 'r1', modelPath: 'C:/models/qwen.gguf', prompt: 'hi' })

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error('Timed out waiting for utility process message')
}
