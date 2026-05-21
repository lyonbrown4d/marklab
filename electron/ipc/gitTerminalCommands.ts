import type * as Electron from 'electron'

import type { NativeCommandHandlers } from './commandInvoke.js'
import { GitService } from '../services/git/service.js'
import { TerminalService } from '../services/terminal/service.js'

type CommandPayload = Record<string, unknown> | undefined

export type GitTerminalIpcBridge = {
  commandHandlers: NativeCommandHandlers
  git: GitService
  terminal: TerminalService
}

export function registerGitTerminalIpc(
  ipcMain: Electron.IpcMain,
  app: Electron.App,
  terminalCwd: () => string,
): GitTerminalIpcBridge {
  const git = new GitService()
  const terminal = new TerminalService(() => terminalCwd() || app.getPath('home'))
  const commandHandlers = createGitTerminalCommandHandlers(git, terminal)

  registerLegacyCommandHandlers(ipcMain, commandHandlers)

  app.on('before-quit', () => {
    terminal.dispose()
  })

  return { commandHandlers, git, terminal }
}

function createGitTerminalCommandHandlers(
  git: GitService,
  terminal: TerminalService,
): NativeCommandHandlers {
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

function registerLegacyCommandHandlers(
  ipcMain: Electron.IpcMain,
  commandHandlers: NativeCommandHandlers,
): void {
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
}

function commandPayload(payload: unknown): CommandPayload {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined
}
