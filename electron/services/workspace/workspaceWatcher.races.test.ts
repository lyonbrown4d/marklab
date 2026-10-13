import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noopLogger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import { WorkspaceWatcher } from '@electron/services/workspace/workspaceWatcher'

const native = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('@parcel/watcher', () => ({ default: { subscribe: native.subscribe } }))
const roots: string[] = []
const instances: WorkspaceWatcher[] = []
const fixture = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-watcher-races-'))
  roots.push(root)
  let state: FsStateData = {
    rootKind: 'external',
    rootPath: root,
    internalRoot: root,
    singleFile: null,
  }
  const changed = vi.fn()
  const status = vi.fn()
  const logger = { ...noopLogger, warn: vi.fn(), error: vi.fn() }
  const instance = new WorkspaceWatcher({
    getState: () => state,
    onChanged: changed,
    setStatus: status,
    logger,
  })
  instances.push(instance)
  return {
    root,
    changed,
    status,
    logger,
    instance,
    setState: (next: FsStateData) => {
      state = next
    },
  }
}
const start = async (f: Awaited<ReturnType<typeof fixture>>) => {
  const before = native.subscribe.mock.calls.length
  f.instance.restart()
  await vi.waitFor(() => expect(native.subscribe.mock.calls.length).toBe(before + 1))
  return native.subscribe.mock.calls[before][1] as (
    error: Error | null,
    events: Array<{ path: string; type: 'create' | 'update' | 'delete' }>,
  ) => void
}
const defer = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  native.subscribe.mockReset().mockResolvedValue({ unsubscribe: native.unsubscribe })
  native.unsubscribe.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => {
  for (const instance of instances.splice(0)) instance.dispose()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('asynchronous workspace watcher events', () => {
  it('keeps create/update/delete order across callbacks while create stat is deferred', async () => {
    const f = await fixture()
    const callback = await start(f)
    const file = path.join(f.root, 'note.md')
    await fs.writeFile(file, '# Note')
    const metadata = await fs.stat(file)
    const held = defer<typeof metadata>()
    const stat = vi.spyOn(fs, 'stat').mockReturnValueOnce(held.promise)
    callback(null, [{ path: file, type: 'create' }])
    callback(null, [
      { path: file, type: 'update' },
      { path: file, type: 'delete' },
    ])
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1))
    expect(f.changed).not.toHaveBeenCalled()
    held.resolve(metadata)
    await vi.waitFor(() =>
      expect(f.changed.mock.calls).toEqual([
        [file, 'add'],
        [file, 'change'],
        [file, 'unlink'],
      ]),
    )
    expect(stat).toHaveBeenCalledTimes(1)
  })

  it('limits create metadata work to sixteen concurrent stats and delivers original order', async () => {
    const f = await fixture()
    const callback = await start(f)
    const metadata = await fs.stat(f.root)
    const held = defer<typeof metadata>()
    let active = 0
    let maximum = 0
    const stat = vi.spyOn(fs, 'stat').mockImplementation(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      const result = await held.promise
      active -= 1
      return result
    })
    const events = Array.from({ length: 37 }, (_, index) => ({
      path: path.join(f.root, `dir-${index}`),
      type: 'create' as const,
    }))
    callback(null, events)
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(16))
    held.resolve(metadata)
    await vi.waitFor(() =>
      expect(f.changed.mock.calls).toEqual(events.map(({ path: entry }) => [entry, 'addDir'])),
    )
    expect(maximum).toBe(16)
    expect(stat).toHaveBeenCalledTimes(37)
  })

  it.each(['restart', 'dispose'] as const)(
    'drops deferred metadata and queued events after %s',
    async (action) => {
      const f = await fixture()
      const callback = await start(f)
      const metadata = await fs.stat(f.root)
      const held = defer<typeof metadata>()
      const stat = vi.spyOn(fs, 'stat').mockReturnValueOnce(held.promise)
      callback(null, [{ path: path.join(f.root, 'old'), type: 'create' }])
      callback(null, [{ path: path.join(f.root, 'old'), type: 'delete' }])
      await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1))
      if (action === 'restart') {
        const next = await start(f)
        next(null, [{ path: path.join(f.root, 'current'), type: 'update' }])
        await vi.waitFor(() => expect(f.changed).toHaveBeenCalledTimes(1))
      } else f.instance.dispose()
      held.resolve(metadata)
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(f.changed.mock.calls).toEqual(
        action === 'restart' ? [[path.join(f.root, 'current'), 'change']] : [],
      )
      callback(null, [{ path: path.join(f.root, 'ignored'), type: 'update' }])
      expect(f.changed.mock.calls).toHaveLength(action === 'restart' ? 1 : 0)
    },
  )

  it('unsubscribes a late native subscription after disposal and handles close failure', async () => {
    const f = await fixture()
    const held = defer<{ unsubscribe: () => Promise<void> }>()
    native.subscribe.mockReturnValueOnce(held.promise)
    await start(f)
    f.instance.dispose()
    const unsubscribe = vi.fn().mockRejectedValue(new Error('close failed'))
    held.resolve({ unsubscribe })
    await vi.waitFor(() =>
      expect(f.logger.warn).toHaveBeenCalledWith('stale watcher close failed', expect.any(Object)),
    )
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('drops stale root stat results before subscribing', async () => {
    const f = await fixture()
    const metadata = await fs.stat(f.root)
    const held = defer<typeof metadata>()
    const stat = vi.spyOn(fs, 'stat').mockReturnValueOnce(held.promise)
    f.instance.restart()
    expect(stat).toHaveBeenCalledTimes(1)
    f.instance.dispose()
    held.resolve(metadata)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(native.subscribe).not.toHaveBeenCalled()
  })

  it('delivers disappearing creates as add and continues after handler failure', async () => {
    const f = await fixture()
    const callback = await start(f)
    f.changed.mockImplementationOnce(() => {
      throw new Error('listener failed')
    })
    callback(null, [{ path: path.join(f.root, 'missing'), type: 'create' }])
    await vi.waitFor(() =>
      expect(f.logger.error).toHaveBeenCalledWith(
        'watcher event processing failed',
        expect.any(Object),
      ),
    )
    callback(null, [{ path: path.join(f.root, 'next'), type: 'update' }])
    await vi.waitFor(() =>
      expect(f.changed.mock.calls).toEqual([
        [path.join(f.root, 'missing'), 'add'],
        [path.join(f.root, 'next'), 'change'],
      ]),
    )
  })
})
