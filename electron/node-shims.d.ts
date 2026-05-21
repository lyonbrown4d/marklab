declare const process: {
  cwd(): string
  env: Record<string, string | undefined>
  platform: string
}

declare const console: {
  error(...args: unknown[]): void
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
}

declare const Buffer: {
  from(
    value: string,
    encoding?: string,
  ): {
    length: number
    toString(encoding?: string): string
  }
}

declare type Buffer = {
  length: number
  toString(encoding?: string): string
}

declare module 'node:fs' {
  type Stats = {
    isDirectory(): boolean
    isFile(): boolean
    len?: number
    size: number
    mtimeMs: number
    mode: number
  }

  type Dirent = {
    name: string
    isDirectory(): boolean
    isFile(): boolean
  }

  type FSWatcher = {
    close(): void
    on(event: 'error', handler: (error: Error) => void): FSWatcher
  }

  const fs: {
    constants: {
      COPYFILE_EXCL: number
    }
    copyFileSync(source: string, target: string, mode?: number): void
    mkdirSync(path: string, options?: { recursive?: boolean }): void
    existsSync(path: string): boolean
    promises: {
      access(path: string): Promise<void>
      copyFile(source: string, target: string, mode?: number): Promise<void>
      mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
      readdir(path: string, options?: { withFileTypes?: boolean }): Promise<Dirent[]>
      readFile(path: string, encoding: 'utf8'): Promise<string>
      rename(from: string, to: string): Promise<void>
      rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
      stat(path: string): Promise<Stats>
      unlink(path: string): Promise<void>
      writeFile(path: string, data: string | Buffer | Uint8Array): Promise<void>
    }
    readFileSync(path: string, encoding: 'utf8'): string
    readdirSync(path: string, options?: { withFileTypes?: boolean }): Dirent[]
    statSync(path: string): Stats
    watch(
      path: string,
      listener: (eventType: 'rename' | 'change', filename: string | Buffer | null) => void,
    ): FSWatcher
    writeFileSync(path: string, data: string | Buffer | Uint8Array): void
  }
  export default fs
}

declare module 'node:fs/promises' {
  import type fs from 'node:fs'

  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function stat(path: string): Promise<ReturnType<typeof fs.statSync>>
}

declare module 'node:child_process' {
  export type ExecFileOptions = {
    cwd?: string
    encoding?: BufferEncoding
    maxBuffer?: number
    shell?: boolean
    windowsHide?: boolean
  }

  export type ExecFileError = Error & {
    stdout?: string
    stderr?: string
  }

  export type ChildProcessWithoutNullStreams = {
    stdin: {
      write(data: string): void
    }
    stdout: {
      on(event: 'data', handler: (data: Buffer) => void): void
    }
    stderr: {
      on(event: 'data', handler: (data: Buffer) => void): void
    }
    on(event: 'exit', handler: (code: number | null, signal: string | null) => void): void
    kill(): void
  }

  export function execFile(
    file: string,
    args: string[],
    options: ExecFileOptions,
    callback: (error: ExecFileError | null, stdout: string, stderr: string) => void,
  ): void

  export function spawn(
    file: string,
    args: string[],
    options: {
      cwd?: string
      env?: Record<string, string | undefined>
      shell?: boolean
      windowsHide?: boolean
    },
  ): ChildProcessWithoutNullStreams
}

declare module 'node:module' {
  export function createRequire(url: string): (id: string) => unknown
}

declare module 'node:os' {
  const os: {
    arch(): string
    homedir(): string
  }
  export default os
}

declare module 'node:path' {
  const path: {
    basename(value: string, suffix?: string): string
    delimiter: string
    dirname(value: string): string
    extname(value: string): string
    isAbsolute(value: string): boolean
    join(...parts: string[]): string
    normalize(value: string): string
    parse(value: string): { name: string; ext: string; base: string; dir: string }
    posix: {
      dirname(value: string): string
      join(...parts: string[]): string
      normalize(value: string): string
    }
    relative(from: string, to: string): string
    resolve(...parts: string[]): string
    sep: string
    posix: {
      dirname(value: string): string
      join(...parts: string[]): string
      normalize(value: string): string
      relative(from: string, to: string): string
    }
    win32: {
      isAbsolute(value: string): boolean
    }
  }
  export default path
}

declare module 'node:url' {
  export function fileURLToPath(value: string | URL): string
}

declare module 'node:util' {
  export function promisify<TArgs extends unknown[], TResult>(
    fn: (...args: [...TArgs, (error: Error | null, result: TResult) => void]) => void,
  ): (...args: TArgs) => Promise<TResult>
}
