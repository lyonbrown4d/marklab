import type * as Electron from 'electron'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import { GitService } from '@electron/services/git/service.js'
import type { Logger } from '@electron/services/logger.js'
import { TerminalService } from '@electron/services/terminal/service.js'
type CommandPayload = Record<string, unknown> | undefined
export type GitTerminalIpcBridge = {
  commandHandlers: NativeCommandHandlers
  git: GitService
  terminal: TerminalService
}
type GitTerminalIpcDependencies = {
  gitService: GitService
  logger: Logger
  terminalService: TerminalService
}
export const registerGitTerminalIpc = (
  ipcMain: Electron.IpcMain,
  app: Electron.App,
  { gitService, logger, terminalService }: GitTerminalIpcDependencies,
): GitTerminalIpcBridge => {
  const git = gitService
  const terminal = terminalService
  const commandHandlers = createGitTerminalCommandHandlers(git, terminal)
  registerLegacyCommandHandlers(ipcMain, commandHandlers)
  app.on('before-quit', () => {
    terminal.dispose()
  })
  logger.info('git and terminal IPC registered')
  return { commandHandlers, git, terminal }
}
const createGitTerminalCommandHandlers = (
  git: GitService,
  terminal: TerminalService,
): NativeCommandHandlers => {
  return {
    git_discover_repo: (payload) => git.discover(commandPayload(payload)?.rootPath),
    git_init_repo: (payload) => git.init(commandPayload(payload)?.rootPath),
    git_get_status: (payload) => git.status(commandPayload(payload)?.rootPath),
    git_get_file_diff: (payload) =>
      git.fileDiff(
        commandPayload(payload)?.rootPath,
        commandPayload(payload)?.path,
        commandPayload(payload)?.section,
      ),
    git_commit_all: (payload) =>
      git.commitAll(commandPayload(payload)?.rootPath, commandPayload(payload)?.message),
    terminal_create: (payload, event) =>
      terminal.create(
        event.sender,
        commandPayload(payload)?.rows,
        commandPayload(payload)?.cols,
        commandPayload(payload)?.cwd,
      ),
    terminal_write: (payload) => {
      terminal.write(commandPayload(payload)?.id, commandPayload(payload)?.data)
    },
    terminal_resize: (payload) => {
      terminal.resize(
        commandPayload(payload)?.id,
        commandPayload(payload)?.rows,
        commandPayload(payload)?.cols,
      )
    },
    terminal_close: (payload) => {
      terminal.close(commandPayload(payload)?.id)
    },
  }
}
const registerLegacyCommandHandlers = (
  ipcMain: Electron.IpcMain,
  commandHandlers: NativeCommandHandlers,
): void => {
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
}
const commandPayload = (payload: unknown): CommandPayload => {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined
}
