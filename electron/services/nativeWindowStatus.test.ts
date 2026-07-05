import { describe, expect, it, vi } from 'vitest'

import {
  applyAppTaskBadge,
  applyWindowTaskAttention,
  applyWindowTaskProgress,
  clearWindowTaskAttention,
  createNativeTaskAttentionState,
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

  it('flashes inactive non-mac windows only for newly failing tasks', () => {
    const state = createNativeTaskAttentionState()
    const window = {
      flashFrame: vi.fn(),
      isDestroyed: () => false,
      isFocused: () => false,
      requestUserAttention: vi.fn(),
    }

    applyWindowTaskAttention(window, [task('search-index', 'error')], state, 'win32')
    applyWindowTaskAttention(window, [task('search-index', 'error')], state, 'win32')

    expect(window.flashFrame).toHaveBeenCalledTimes(1)
    expect(window.flashFrame).toHaveBeenCalledWith(true)
    expect(window.requestUserAttention).not.toHaveBeenCalled()
  })

  it('requests macOS attention for newly failing tasks', () => {
    const state = createNativeTaskAttentionState()
    const window = {
      flashFrame: vi.fn(),
      isDestroyed: () => false,
      isFocused: () => false,
      requestUserAttention: vi.fn(),
    }

    applyWindowTaskAttention(window, [task('watcher', 'error')], state, 'darwin')

    expect(window.requestUserAttention).toHaveBeenCalledWith('informational')
    expect(window.flashFrame).not.toHaveBeenCalled()
  })

  it('does not request attention for focused windows', () => {
    const state = createNativeTaskAttentionState()
    const window = {
      flashFrame: vi.fn(),
      isDestroyed: () => false,
      isFocused: () => true,
      requestUserAttention: vi.fn(),
    }

    applyWindowTaskAttention(window, [task('buffer-flush', 'error')], state, 'linux')

    expect(window.flashFrame).not.toHaveBeenCalled()
    expect(window.requestUserAttention).not.toHaveBeenCalled()
  })

  it('stops non-mac flashing when task errors clear', () => {
    const state = createNativeTaskAttentionState()
    const window = {
      flashFrame: vi.fn(),
      isDestroyed: () => false,
      isFocused: () => false,
      requestUserAttention: vi.fn(),
    }

    applyWindowTaskAttention(window, [task('search-index', 'error')], state, 'linux')
    applyWindowTaskAttention(window, [task('search-index', 'idle')], state, 'linux')

    expect(window.flashFrame).toHaveBeenNthCalledWith(1, true)
    expect(window.flashFrame).toHaveBeenNthCalledWith(2, false)
  })

  it('can explicitly clear native task attention', () => {
    const window = {
      flashFrame: vi.fn(),
      isDestroyed: () => false,
    }

    clearWindowTaskAttention(window)

    expect(window.flashFrame).toHaveBeenCalledWith(false)
  })
})
