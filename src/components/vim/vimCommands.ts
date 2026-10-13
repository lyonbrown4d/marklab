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
