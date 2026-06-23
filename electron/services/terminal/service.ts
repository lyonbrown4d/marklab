import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import type * as Electron from 'electron'
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import { Subject, bufferTime, filter, map, type Subscription } from 'rxjs'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSessionInfo,
} from '@electron/services/terminal/types.js'
type NodePtyModule = typeof import('@homebridge/node-pty-prebuilt-multiarch')
type CwdProvider = (webContents?: Electron.WebContents) => string
type TerminalSession = {
  process: IPty
  webContents: Electron.WebContents
  output: Subject<string>
  outputSubscription: Subscription
}
const require = createRequire(import.meta.url)
const MIN_ROWS = 8
const MAX_ROWS = 200
const MIN_COLS = 20
const MAX_COLS = 400
const OUTPUT_BUFFER_MS = 12
export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>()
  private nextId = 1
  private ptyModule: NodePtyModule | undefined
  constructor(
    private readonly defaultCwd: string | CwdProvider = os.homedir(),
    private readonly logger: Logger = noopLogger,
  ) {}
  create(
    webContents: Electron.WebContents,
    rows: unknown,
    cols: unknown,
    cwdOverride?: unknown,
  ): TerminalSessionInfo {
    const id = `terminal-${this.nextId}`
    this.nextId += 1
    const cwd = normalizeCwd(
      typeof cwdOverride === 'string' ? cwdOverride : resolveCwd(this.defaultCwd, webContents),
    )
    const shell = defaultShell()
    const size = normalizedSize(rows, cols)
    const pty = this.loadPty()
    try {
      const terminal = pty.spawn(shell, [], {
        cols: size.cols,
        rows: size.rows,
        cwd,
        env: {
          ...process.env,
          TERM: process.env.TERM || 'xterm-256color',
          COLORTERM: process.env.COLORTERM || 'truecolor',
        },
        name: 'xterm-256color',
      })
      const output = new Subject<string>()
      const outputSubscription = output
        .pipe(
          bufferTime(OUTPUT_BUFFER_MS),
          filter((chunks) => chunks.length > 0),
          map((chunks) => chunks.join('')),
        )
        .subscribe((data) => {
          this.emitOutput(webContents, { id, data })
        })
      terminal.onData((data) => {
        output.next(data)
      })
      terminal.onExit(({ exitCode, signal }) => {
        this.removeSession(id)
        this.logger.info('terminal session exited', { exitCode, id, signal })
        this.emitExit(webContents, {
          id,
          exit_code: typeof exitCode === 'number' ? exitCode : null,
          signal: signal === undefined || signal === null ? null : String(signal),
        })
      })
      this.sessions.set(id, { process: terminal, webContents, output, outputSubscription })
      this.logger.info('terminal session created', { cwd, id, shell })
    } catch (error) {
      throw new Error(`Failed to start PTY terminal: ${formatError(error)}`, { cause: error })
    }
    return { id, shell, cwd }
  }
  write(id: unknown, data: unknown): void {
    const session = this.requireSession(id)
    if (typeof data !== 'string') throw new Error('Terminal input must be a string')
    session.process.write(data)
  }
  resize(id: unknown, rows: unknown, cols: unknown): void {
    const session = this.requireSession(id)
    const size = normalizedSize(rows, cols)
    session.process.resize(size.cols, size.rows)
  }
  close(id: unknown): void {
    const sessionId = validateSessionId(id)
    const session = this.removeSession(sessionId)
    if (!session) return
    this.logger.info('terminal session closed', { id: sessionId })
    session.process.kill()
  }
  dispose(): void {
    for (const id of [...this.sessions.keys()]) {
      this.close(id)
    }
  }
  private requireSession(id: unknown): TerminalSession {
    const sessionId = validateSessionId(id)
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Terminal session not found: ${sessionId}`)
    return session
  }
  private loadPty(): NodePtyModule {
    if (this.ptyModule !== undefined) return this.ptyModule
    try {
      this.ptyModule = require('@homebridge/node-pty-prebuilt-multiarch') as NodePtyModule
    } catch (error) {
      throw new Error(
        `PTY backend is unavailable. Reinstall dependencies or run pnpm install: ${formatError(error)}`,
        { cause: error },
      )
    }
    return this.ptyModule
  }
  private removeSession(id: string): TerminalSession | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined
    this.sessions.delete(id)
    try {
      session.output.complete()
    } finally {
      session.outputSubscription.unsubscribe()
    }
    return session
  }
  private emitOutput(webContents: Electron.WebContents, payload: TerminalOutputEvent): void {
    if (!webContents.isDestroyed()) webContents.send('terminal-output', payload)
  }
  private emitExit(webContents: Electron.WebContents, payload: TerminalExitEvent): void {
    if (!webContents.isDestroyed()) webContents.send('terminal-exit', payload)
  }
}
const validateSessionId = (id: unknown): string => {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Terminal id is required')
  return id
}
const normalizedSize = (rows: unknown, cols: unknown) => {
  return {
    rows: clampInteger(rows, MIN_ROWS, MAX_ROWS, 24),
    cols: clampInteger(cols, MIN_COLS, MAX_COLS, 80),
  }
}
const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.trunc(value < min ? min : value > max ? max : value)
}
const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}
const resolveCwd = (
  defaultCwd: string | CwdProvider,
  webContents?: Electron.WebContents,
): string => {
  if (typeof defaultCwd === 'string') return defaultCwd
  try {
    return defaultCwd(webContents)
  } catch {
    return os.homedir()
  }
}
const normalizeCwd = (cwd: string): string => {
  const resolved = path.resolve(cwd || os.homedir())
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : os.homedir()
  } catch {
    return os.homedir()
  }
}
const defaultShell = (): string => {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
}
