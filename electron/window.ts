import { BrowserWindow, app, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getWindowState, setWindowState } from './services/settingsStore.js'
import type { PersistedWindowState } from './types.js'

const DEV_SERVER_URL = 'http://localhost:5173'
const DEV_LOAD_RETRIES = 25
const DEV_LOAD_RETRY_MS = 200
const MAIN_WINDOW_MIN_WIDTH = 640
const MAIN_WINDOW_MIN_HEIGHT = 480
const MAIN_WINDOW_DEFAULT_WIDTH = 800
const MAIN_WINDOW_DEFAULT_HEIGHT = 600
const WINDOW_STATE_SAVE_DELAY_MS = 250

const electronDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(electronDir, '..')
const preloadPath = path.join(electronDir, 'preload.cjs')

export type MarkoWindows = {
  splash: BrowserWindow
  main: BrowserWindow
}

type WindowBounds = {
  height: number
  width: number
  x: number
  y: number
}

function isDevMode() {
  return !app.isPackaged
}

function getRendererUrl(page = '') {
  if (isDevMode()) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? DEV_SERVER_URL
    return new URL(page, devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`).toString()
  }

  return path.join(projectRoot, 'dist', page || 'index.html')
}

function secureWebPreferences() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    preload: preloadPath,
  } satisfies Electron.WebPreferences
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function loadDevUrl(window: BrowserWindow, url: string) {
  let lastError: unknown

  for (let attempt = 0; attempt < DEV_LOAD_RETRIES; attempt += 1) {
    try {
      await window.loadURL(url)
      return
    } catch (error) {
      lastError = error
      await delay(DEV_LOAD_RETRY_MS)
    }
  }

  throw lastError
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function normalizedDimension(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.round(value))
    : fallback
}

function normalizedCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined
}

function normalizeWindowState(value: unknown): PersistedWindowState | null {
  if (!isRecord(value)) return null
  return {
    width: normalizedDimension(value.width, MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_DEFAULT_WIDTH),
    height: normalizedDimension(value.height, MAIN_WINDOW_MIN_HEIGHT, MAIN_WINDOW_DEFAULT_HEIGHT),
    x: normalizedCoordinate(value.x),
    y: normalizedCoordinate(value.y),
    isMaximized: value.isMaximized === true,
  }
}

function readWindowState(): PersistedWindowState | null {
  try {
    return normalizeWindowState(getWindowState())
  } catch (error) {
    console.warn('Unable to read persisted window state.', error)
    return null
  }
}

function writeWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getNormalBounds()
    const state: PersistedWindowState = {
      width: Math.max(MAIN_WINDOW_MIN_WIDTH, Math.round(bounds.width)),
      height: Math.max(MAIN_WINDOW_MIN_HEIGHT, Math.round(bounds.height)),
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      isMaximized: window.isMaximized(),
    }
    setWindowState(state)
  } catch (error) {
    console.warn('Unable to persist window state.', error)
  }
}

function rectanglesIntersect(a: WindowBounds, b: WindowBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function hasVisibleArea(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => rectanglesIntersect(bounds, display.workArea))
}

function restoredWindowBounds() {
  const state = readWindowState()
  if (!state) {
    return {
      bounds: {
        width: MAIN_WINDOW_DEFAULT_WIDTH,
        height: MAIN_WINDOW_DEFAULT_HEIGHT,
      },
      isMaximized: false,
    }
  }

  const bounds = {
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
  }
  const visibleBounds =
    state.x !== undefined && state.y !== undefined
      ? {
          x: state.x,
          y: state.y,
          width: state.width,
          height: state.height,
        }
      : null

  return {
    bounds:
      visibleBounds && !hasVisibleArea(visibleBounds)
        ? { width: state.width, height: state.height }
        : bounds,
    isMaximized: state.isMaximized,
  }
}

function persistWindowState(window: BrowserWindow): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const saveNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!window.isDestroyed()) writeWindowState(window)
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, WINDOW_STATE_SAVE_DELAY_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', saveNow)
}

export function createSplashWindow() {
  return new BrowserWindow({
    width: 420,
    height: 280,
    title: 'marko',
    resizable: false,
    fullscreen: false,
    frame: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    webPreferences: secureWebPreferences(),
  })
}

export function createMainWindow() {
  const restored = restoredWindowBounds()
  const main = new BrowserWindow({
    ...restored.bounds,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    title: 'marko',
    resizable: true,
    fullscreen: false,
    frame: false,
    show: false,
    webPreferences: secureWebPreferences(),
  })

  persistWindowState(main)
  if (restored.isMaximized) main.maximize()
  return main
}

export async function loadSplashWindow(splash: BrowserWindow) {
  const splashPage = getRendererUrl('splashscreen.html')
  if (isDevMode()) {
    await loadDevUrl(splash, splashPage)
    return
  }

  await splash.loadFile(splashPage)
}

export async function loadMainWindow(main: BrowserWindow) {
  if (isDevMode()) {
    await loadDevUrl(main, getRendererUrl())
    return
  }

  await main.loadFile(getRendererUrl())
}

export async function createMarkoWindows(): Promise<MarkoWindows> {
  const splash = createSplashWindow()
  const main = createMainWindow()

  await Promise.all([loadSplashWindow(splash), loadMainWindow(main)])

  return { splash, main }
}
