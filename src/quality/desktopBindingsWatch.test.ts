import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViteDevServer } from 'vite'
// eslint-disable-next-line no-restricted-imports -- Exercises the development-only build integration.
import { desktopBindingsPlugin } from '../../vite.desktopBindings.ts'

const { generate } = vi.hoisted(() => ({
  generate: vi.fn<(signal?: AbortSignal) => Promise<void>>(),
}))
vi.mock('../../scripts/generate-desktop-bindings.ts', () => ({ generateDesktopBindings: generate }))

const rustFile = path.join(process.cwd(), 'src-tauri/src/workspace/types.rs')
const fixture = () => {
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const httpServer = new EventEmitter()
  const send = vi.fn()
  const error = vi.fn()
  const server = {
    watcher,
    httpServer,
    ws: { send },
    config: { root: process.cwd(), logger: { error } },
  }
  const hook = desktopBindingsPlugin().configureServer
  if (typeof hook !== 'function') throw new Error('Expected a Vite server hook.')
  const configure: OmitThisParameter<typeof hook> = hook
  configure(server as unknown as ViteDevServer)
  return { watcher, httpServer, send, error }
}

describe('desktop contract development watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    generate.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('coalesces Rust edits, ignores renderer changes, and refreshes after generation', async () => {
    const { watcher, httpServer, send } = fixture()
    watcher.emit('all', 'change', '/renderer.tsx')
    await vi.advanceTimersByTimeAsync(300)
    expect(generate).not.toHaveBeenCalled()
    watcher.emit('all', 'change', rustFile)
    watcher.emit('all', 'add', rustFile)
    await vi.advanceTimersByTimeAsync(300)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' })
    httpServer.emit('close')
    expect(watcher.listenerCount('all')).toBe(0)
  })

  it('reports generation failures through the development overlay', async () => {
    generate.mockRejectedValueOnce(new Error('Rust contract failed'))
    const { watcher, httpServer, send, error } = fixture()
    watcher.emit('all', 'change', rustFile)
    await vi.advanceTimersByTimeAsync(300)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        err: expect.objectContaining({ message: 'Rust contract failed' }),
      }),
    )
    expect(send).not.toHaveBeenCalledWith({ type: 'full-reload' })
    expect(error).toHaveBeenCalled()
    httpServer.emit('close')
  })

  it('bounds pending regeneration and aborts the active process on server shutdown', async () => {
    let finish: (() => void) | undefined
    generate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { watcher, httpServer } = fixture()
    watcher.emit('all', 'change', rustFile)
    await vi.advanceTimersByTimeAsync(300)
    for (let index = 0; index < 3; index += 1) {
      watcher.emit('all', 'change', rustFile)
      await vi.advanceTimersByTimeAsync(300)
    }
    expect(generate).toHaveBeenCalledTimes(1)
    httpServer.emit('close')
    expect(generate.mock.calls[0][0]?.aborted).toBe(true)
    finish?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
