import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { APP_EVENT, emitAppEvent } from '@/utils/appEvents'

export type VimCommand = 'write' | 'quit' | 'writeQuit'
export type VimCommandHandlers = {
  write: () => void | Promise<void>
  quit: () => void | Promise<void>
}

export const executeVimCommand = async (
  command: VimCommand,
  handlers: VimCommandHandlers,
): Promise<void> => {
  if (command !== 'quit') await handlers.write()
  if (command !== 'write') await handlers.quit()
}

// Preserve different commands issued during a save; repeated pending commands
// share that operation instead of starting duplicate writes.
export const createVimCommandRunner = ({
  handlers,
  isCurrent,
  onError,
  onSuccess,
}: {
  handlers: VimCommandHandlers
  isCurrent: () => boolean
  onError: (error: unknown) => void
  onSuccess?: () => void
}): ((command: VimCommand) => void) => {
  let pending: VimCommand | null = null
  let queued: VimCommand | null = null
  const run = (command: VimCommand): void => {
    if (!isCurrent()) return
    if (pending) {
      if (command !== pending) queued = command
      return
    }
    pending = command
    const guarded: VimCommandHandlers = {
      write: () => (isCurrent() ? handlers.write() : undefined),
      quit: () => (isCurrent() ? handlers.quit() : undefined),
    }
    void executeVimCommand(command, guarded)
      .then(() => {
        if (isCurrent()) onSuccess?.()
      })
      .catch((error: unknown) => {
        if (isCurrent()) onError(error)
      })
      .finally(() => {
        pending = null
        const next = queued
        queued = null
        if (next) run(next)
      })
  }
  return run
}

export const createSourceVimCommands = ({
  path,
  workspaceKey,
  isCurrent,
}: {
  path: string | null
  workspaceKey: string
  isCurrent: () => boolean
}): VimCommandHandlers => ({
  write: async () => {
    if (isCurrent()) await flushEditorChanges()
  },
  quit: async () => {
    if (!path || !isCurrent()) return
    await flushEditorChanges()
    if (isCurrent()) emitAppEvent(APP_EVENT.closeVimSource, { path, workspaceKey })
  },
})
