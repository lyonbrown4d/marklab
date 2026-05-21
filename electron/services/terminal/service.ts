import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import type * as Electron from 'electron'
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import type { TerminalExitEvent, TerminalOutputEvent, TerminalSessionInfo } from './types.js'
type NodePtyModule = typeof import('@homebridge/node-pty-prebuilt-multiarch')
type CwdProvider = () => string
type TerminalSession =
  | {
      kind: 'pty'
      process: IPty
      webContents: Electron.WebContents
    }
  | {
      kind: 'fallback'
      process: ChildProcessWithoutNullStreams
      webContents: Electron.WebContents
    }
const require = createRequire(import.meta.url)
const MIN_ROWS = 8
const MAX_ROWS = 200
const MIN_COLS = 20
const MAX_COLS = 400
export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>()
  private nextId = 1
  private ptyModule: NodePtyModule | null | undefined
  constructor(private readonly defaultCwd: string | CwdProvider = os.homedir()) {}
  create(
    webContents: Electron.WebContents,
    rows: unknown,
    cols: unknown,
    cwdOverride?: unknown,
  ): TerminalSessionInfo {
    const id = `terminal-${this.nextId}`
    this.nextId += 1
    const cwd = normalizeCwd(
      typeof cwdOverride === 'string' ? cwdOverride : resolveCwd(this.defaultCwd),
    )
    const shell = defaultShell()
    const size = normalizedSize(rows, cols)
    const pty = this.loadPty()
    if (pty) {
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
      terminal.onData((data) => {
        this.emitOutput(webContents, { id, data })
      })
      terminal.onExit(({ exitCode, signal }) => {
        this.sessions.delete(id)
        this.emitExit(webContents, {
          id,
          exit_code: typeof exitCode === 'number' ? exitCode : null,
          signal: signal === undefined || signal === null ? null : String(signal),
        })
      })
      this.sessions.set(id, { kind: 'pty', process: terminal, webContents })
      return { id, shell, cwd }
    }
    const child = spawn(shell, [], {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    })
    child.stdout.on('data', (data: Buffer) => {
      this.emitOutput(webContents, { id, data: data.toString('utf8') })
    })
    child.stderr.on('data', (data: Buffer) => {
      this.emitOutput(webContents, { id, data: data.toString('utf8') })
    })
    child.on('exit', (code, signal) => {
      this.sessions.delete(id)
      this.emitExit(webContents, { id, exit_code: code, signal })
    })
    this.sessions.set(id, { kind: 'fallback', process: child, webContents })
    this.emitOutput(webContents, {
      id,
      data: '\r\n[marklab] PTY backend is unavailable; terminal is running without resize/full-screen parity.\r\n',
    })
    return { id, shell, cwd }
  }
  write(id: unknown, data: unknown): void {
    const session = this.requireSession(id)
    if (typeof data !== 'string') throw new Error('Terminal input must be a string')
    if (session.kind === 'pty') {
      session.process.write(data)
      return
    }
    session.process.stdin.write(data)
  }
  resize(id: unknown, rows: unknown, cols: unknown): void {
    const session = this.requireSession(id)
    const size = normalizedSize(rows, cols)
    if (session.kind === 'pty') {
      session.process.resize(size.cols, size.rows)
    }
  }
  close(id: unknown): void {
    const sessionId = validateSessionId(id)
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    if (session.kind === 'pty') {
      session.process.kill()
      return
    }
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
  private loadPty(): NodePtyModule | null {
    if (this.ptyModule !== undefined) return this.ptyModule
    try {
      this.ptyModule = require('@homebridge/node-pty-prebuilt-multiarch') as NodePtyModule
    } catch {
      this.ptyModule = null
    }
    return this.ptyModule
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
const resolveCwd = (defaultCwd: string | CwdProvider): string => {
  if (typeof defaultCwd === 'string') return defaultCwd
  try {
    return defaultCwd()
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
