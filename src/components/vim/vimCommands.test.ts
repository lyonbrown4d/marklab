import { describe, expect, it, vi } from 'vitest'
import { createSourceVimCommands, executeVimCommand } from '@/components/vim/vimCommands'
import { APP_EVENT, onAppEvent } from '@/utils/appEvents'

const flush = vi.hoisted(() => ({ run: vi.fn(async () => {}) }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: flush.run }))

describe('Vim persistence commands', () => {
  it('writes before quitting and does not quit on a failed write', async () => {
    const order: string[] = []
    const handlers = {
      write: vi.fn(async (): Promise<void> => {
        order.push('write')
        throw new Error('disk full')
      }),
      quit: vi.fn(() => {
        order.push('quit')
      }),
    }
    await expect(executeVimCommand('writeQuit', handlers)).rejects.toThrow('disk full')
    expect(order).toEqual(['write'])
    handlers.write.mockImplementation(async () => {
      order.push('write')
    })
    await executeVimCommand('writeQuit', handlers)
    expect(order).toEqual(['write', 'write', 'quit'])
  })

  it('flushes pending buffers before closing the expected source', async () => {
    flush.run.mockResolvedValue()
    const close = vi.fn()
    const unsubscribe = onAppEvent(APP_EVENT.closeVimSource, close)
    try {
      const commands = createSourceVimCommands({
        path: 'note.md',
        workspaceKey: 'external:/one',
        isCurrent: () => true,
      })
      await commands.quit()
      expect(flush.run).toHaveBeenCalled()
      expect(close).toHaveBeenCalledExactlyOnceWith({
        path: 'note.md',
        workspaceKey: 'external:/one',
      })
    } finally {
      unsubscribe()
    }
  })

  it('never closes a replacement editor after an asynchronous flush', async () => {
    let current = true
    flush.run.mockImplementationOnce(async () => {
      current = false
    })
    const close = vi.fn()
    const unsubscribe = onAppEvent(APP_EVENT.closeVimSource, close)
    try {
      await createSourceVimCommands({
        path: 'note.md',
        workspaceKey: 'external:/one',
        isCurrent: () => current,
      }).quit()
      expect(close).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
