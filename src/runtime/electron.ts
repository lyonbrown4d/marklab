type ElectronPlatformInfo = {
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
}

export type ElectronCommandArgs = Record<string, unknown> | undefined

export type ElectronOpenDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
  multiple?: boolean
  directory?: boolean
  file?: boolean
}

export type ElectronSaveDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export type ElectronFileDropEvent = {
  paths: string[]
  position: {
    x: number
    y: number
  }
}

export type ElectronLaunchSource = 'startup' | 'second-instance' | 'open-url'

export type ElectronSingleInstanceEvent = {
  args: string[]
  cwd: string
}

export type ElectronDeepLinkEvent = {
  url: string
  source: ElectronLaunchSource
  receivedAt: number
}

export type ElectronLaunchInfo = ElectronSingleInstanceEvent & {
  deepLinks: ElectronDeepLinkEvent[]
}

export type ElectronRuntimeEvent<T = unknown> = {
  event: string
  id: number
  payload: T
}

export type ElectronRuntimeApi = {
  appReady: () => Promise<{ ok: boolean }>
  lifecycle?: {
    getLaunchInfo: () => Promise<ElectronLaunchInfo>
  }
  commands?: {
    invoke: <T = unknown>(command: string, args?: ElectronCommandArgs) => Promise<T>
  }
  events?: {
    listen: <T = unknown>(
      eventName: string,
      handler: (event: ElectronRuntimeEvent<T>) => void,
    ) => (() => void) | Promise<() => void>
    emit?: <T = unknown>(eventName: string, payload?: T) => Promise<void> | void
  }
  platform: {
    get: () => Promise<ElectronPlatformInfo>
  }
  menu: {
    dispatch: (id: string) => Promise<{ ok: boolean }>
    onCommand: (handler: (id: string) => void) => () => void
  }
  dialog: {
    open: (options?: ElectronOpenDialogOptions) => Promise<string | string[] | null>
    save: (options?: ElectronSaveDialogOptions) => Promise<string | null>
  }
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<{ ok: boolean }>
    readImage: () => Promise<{ dataUrl: string; width: number; height: number } | null>
  }
  shell: {
    openPath: (path: string) => Promise<{ ok: boolean; path?: string; error?: string }>
    revealPath: (path: string) => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  settings?: {
    persist?: {
      getItem: (key: string) => Promise<unknown>
      setItem: (key: string, value: unknown) => Promise<{ ok: boolean; error?: string }>
      removeItem: (key: string) => Promise<{ ok: boolean; error?: string }>
    }
  }
  assets?: {
    convertFileSrc?: (path: string) => string
  }
  webview?: {
    onFileDrop?: (handler: (event: ElectronFileDropEvent) => void) => () => void
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    close: () => Promise<void>
    startDragging: () => Promise<void>
  }
}

declare global {
  interface Window {
    markoElectron?: ElectronRuntimeApi
  }
}

export function getElectronRuntime() {
  if (typeof window === 'undefined') return null
  return window.markoElectron ?? null
}

export function isElectronRuntime() {
  return getElectronRuntime() !== null
}
