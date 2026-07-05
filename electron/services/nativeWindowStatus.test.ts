import { describe, expect, it, vi } from 'vitest'

import {
  applyAppTaskBadge,
  applyWindowTaskProgress,
  summarizeNativeTasks,
} from '@electron/services/nativeWindowStatus.js'
import type { BackgroundTaskStatus } from '@electron/services/workspace/types.js'

const task = (
  id: string,
  status: BackgroundTaskStatus['status'],
  message: string | null = null,
): BackgroundTaskStatus => ({
  id,
  label: id,
  message,
  status,
})

describe('native window task status', () => {
  it('keeps long-lived watcher activity out of user-visible progress', () => {
    const tasks = [task('watcher', 'running')]

    expect(summarizeNativeTasks(tasks)).toEqual({ activeCount: 0, errorCount: 0 })

    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }
    const app = {
      dock: { setBadge: vi.fn() },
      setBadgeCount: vi.fn(),
    }

    applyWindowTaskProgress(window, tasks)
    applyAppTaskBadge(app, tasks)

    expect(window.setProgressBar).toHaveBeenCalledWith(-1)
    expect(app.setBadgeCount).toHaveBeenCalledWith(0)
    expect(app.dock.setBadge).toHaveBeenCalledWith('')
  })

  it('maps active short workspace tasks to indeterminate native progress', () => {
    const tasks = [task('search-index', 'running'), task('buffer-flush', 'running')]
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }
    const app = {
      dock: { setBadge: vi.fn() },
      setBadgeCount: vi.fn(),
    }

    applyWindowTaskProgress(window, tasks)
    applyAppTaskBadge(app, tasks)

    expect(window.setProgressBar).toHaveBeenCalledWith(2, { mode: 'indeterminate' })
    expect(app.setBadgeCount).toHaveBeenCalledWith(2)
    expect(app.dock.setBadge).toHaveBeenCalledWith('2')
  })

  it('lets background task errors override active progress', () => {
    const tasks = [task('search-index', 'running'), task('watcher', 'error', 'watch failed')]
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }
    const app = {
      dock: { setBadge: vi.fn() },
      setBadgeCount: vi.fn(),
    }

    applyWindowTaskProgress(window, tasks)
    applyAppTaskBadge(app, tasks)

    expect(window.setProgressBar).toHaveBeenCalledWith(1, { mode: 'error' })
    expect(app.setBadgeCount).toHaveBeenCalledWith(1)
    expect(app.dock.setBadge).toHaveBeenCalledWith('1')
  })

  it('does not touch destroyed windows', () => {
    const window = {
      isDestroyed: () => true,
      setProgressBar: vi.fn(),
    }

    applyWindowTaskProgress(window, [task('search-index', 'running')])

    expect(window.setProgressBar).not.toHaveBeenCalled()
  })
})
