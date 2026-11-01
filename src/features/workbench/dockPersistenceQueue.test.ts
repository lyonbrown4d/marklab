import { afterEach, expect, it, vi } from 'vitest'
import { createDockPersistenceQueue } from '@/features/workbench/dockPersistenceQueue'
import type { WorkspaceLayout } from '@/services/workspaceLayoutApi'

const layout = (width: number): WorkspaceLayout => ({
  grid: { root: { type: 'branch', data: [] }, width, height: 800, orientation: 'HORIZONTAL' },
  panels: {},
})
afterEach(() => vi.useRealTimers())

it('debounces edits, serializes writes, and coalesces the latest pending snapshot', async () => {
  vi.useFakeTimers()
  let finish: (() => void) | undefined
  const save = vi
    .fn<(value: WorkspaceLayout) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(undefined)
  const queue = createDockPersistenceQueue({ initial: layout(100), save, onError: vi.fn() })
  queue.mark(layout(200))
  queue.mark(layout(300))
  await vi.advanceTimersByTimeAsync(249)
  expect(save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(save.mock.calls.map(([value]) => value.grid.width)).toEqual([300])
  queue.mark(layout(400))
  queue.mark(layout(500))
  const flushed = queue.flush()
  finish?.()
  await flushed
  expect(save.mock.calls.map(([value]) => value.grid.width)).toEqual([300, 500])
  await queue.flush()
  expect(save).toHaveBeenCalledTimes(2)
  queue.dispose()
})

it('rejects close flushing on save failure, retains dirty data, and retries explicitly', async () => {
  const error = new Error('disk unavailable')
  const onError = vi.fn()
  const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
  const queue = createDockPersistenceQueue({ initial: layout(100), save, onError })
  queue.mark(layout(200))
  await expect(queue.flush()).rejects.toBe(error)
  expect(onError).toHaveBeenCalledWith(error)
  await queue.flush()
  expect(save).toHaveBeenLastCalledWith(layout(200))
  expect(save).toHaveBeenCalledTimes(2)
  queue.dispose()
})

it('never writes a clean inactive window on close and cancels an unflushed disposed workspace', async () => {
  vi.useFakeTimers()
  const save = vi.fn().mockResolvedValue(undefined)
  const queue = createDockPersistenceQueue({ initial: layout(100), save, onError: vi.fn() })
  await queue.flush()
  queue.mark(layout(200))
  queue.mark(layout(100))
  await queue.flush()
  expect(save).not.toHaveBeenCalled()
  queue.mark(layout(300))
  queue.dispose()
  await vi.runAllTimersAsync()
  await queue.flush()
  expect(save).not.toHaveBeenCalled()
})

it('surfaces an invalid current layout, blocks saving stale snapshots, and recovers after correction', async () => {
  vi.useFakeTimers()
  const save = vi.fn().mockResolvedValue(undefined)
  const onError = vi.fn()
  const queue = createDockPersistenceQueue({ initial: layout(100), save, onError })
  queue.mark(layout(200))
  const invalid = new Error('Too many dock groups')
  queue.invalidate(invalid)
  await vi.runAllTimersAsync()
  await expect(queue.flush()).rejects.toBe(invalid)
  expect(onError).toHaveBeenCalledWith(invalid)
  expect(save).not.toHaveBeenCalled()
  queue.mark(layout(200))
  await queue.flush()
  expect(save).toHaveBeenCalledWith(layout(200))
  queue.dispose()
})
