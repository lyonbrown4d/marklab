import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  stops: [] as ReturnType<typeof vi.fn>[],
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    onCloseRequested: async () => vi.fn(),
    isVisible: async () => false,
    scaleFactor: async () => 1,
    onScaleChanged: async () => vi.fn(),
  }),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async () => vi.fn(),
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  native.handlers.clear()
  native.stops = []
  native.isTauri.mockReturnValue(true)
  native.invoke.mockReset().mockResolvedValue(null)
  native.listen.mockReset().mockImplementation(async (event, handler) => {
    native.handlers.set(event, handler)
    const stop = vi.fn()
    native.stops.push(stop)
    return stop
  })
})
afterEach(() => {
  delete window.marklabTauri
})

describe('Tauri renderer initialization', () => {
  it('forwards preview subscriber controls through named typed commands', async () => {
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await initializeDesktopRuntime()
    const preview = window.marklabTauri!.linkPreview
    const requestId = '6070af3a-dcdd-45aa-af57-97ab3b012345'
    await preview.capture('https://example.com/', { requestId, priority: 'background' })
    expect(native.invoke).toHaveBeenLastCalledWith('link_preview_capture', {
      request: { url: 'https://example.com/', requestId, priority: 'background' },
    })
    await preview.promote(requestId)
    expect(native.invoke).toHaveBeenLastCalledWith('link_preview_promote', {
      request: { requestId },
    })
    await preview.cancel(requestId)
    expect(native.invoke).toHaveBeenLastCalledWith('link_preview_cancel', {
      request: { requestId },
    })
  })

  it('exposes domain APIs after the seed is available and replays it to late subscribers', async () => {
    const seed = { version: 3, state: { workspacePath: '/work' } }
    native.invoke.mockImplementation(async (command) =>
      command === 'workspace_session_seed' ? seed : { ok: true },
    )
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    const first = initializeDesktopRuntime()
    expect(initializeDesktopRuntime()).toBe(first)
    await first
    expect(
      native.listen.mock.calls.every(
        ([, , options]) =>
          options?.target?.kind === 'WebviewWindow' && options.target.label === 'main',
      ),
    ).toBe(true)
    const { getDesktopRuntime, isDesktopRuntime } = await import('@/runtime/desktop')
    expect(isDesktopRuntime()).toBe(true)
    const api = getDesktopRuntime()
    const receive = vi.fn()
    api.events.listen('workspace-session-seed', receive)
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ payload: seed }))
    await api.settings.persist.setItem('editor', { vim: true })
    expect(native.invoke).toHaveBeenLastCalledWith('settings_persist_set', {
      request: { key: 'editor', value: { vim: true } },
    })
    await api.window.setVimKeyboardOwnership(true)
    expect(native.invoke).toHaveBeenLastCalledWith('window_set_vim_keyboard_ownership', {
      request: { active: true },
    })
  })

  it('pins readiness to the native attempt and strips it from workspace seeds', async () => {
    native.invoke.mockImplementation(async (command) =>
      command === 'workspace_session_seed'
        ? { version: 3, state: { rootPath: '/work' }, nativeAttempt: 2 }
        : { ok: true },
    )
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await initializeDesktopRuntime()
    const api = window.marklabTauri!
    const receive = vi.fn()
    api.events.listen('workspace-session-seed', receive)
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { version: 3, state: { rootPath: '/work' } } }),
    )
    await api.appReady({ phase: 'workspace-interactive' })
    expect(native.invoke).toHaveBeenLastCalledWith('app_ready', {
      request: { phase: 'workspace-interactive', attempt: 2 },
    })
    native.handlers.get('workspace-session-seed')?.({
      payload: { state: { rootPath: '/new' }, nativeAttempt: 3 },
    })
    await api.commands.invoke('app-ready', { phase: 'workspace-interactive' })
    expect(native.invoke).toHaveBeenLastCalledWith('app_ready', {
      request: { phase: 'workspace-interactive', attempt: 3 },
    })
  })

  it('preserves a live seed received while fetching the startup snapshot', async () => {
    const current = { version: 8, state: { workspacePath: '/latest' } }
    native.invoke.mockImplementation(async () => {
      native.handlers.get('workspace-session-seed')?.({ payload: current })
      return { version: 7, state: { workspacePath: '/stale' } }
    })
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await initializeDesktopRuntime()
    const receive = vi.fn()
    window.marklabTauri?.events.listen('workspace-session-seed', receive)
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ payload: current }))
  })

  it('releases native listeners on startup failure and retries without installing a false success', async () => {
    native.invoke.mockRejectedValueOnce(new Error('Workspace recovery failed'))
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await expect(initializeDesktopRuntime()).rejects.toThrow('Workspace recovery failed')
    expect(window.marklabTauri).toBeUndefined()
    expect(native.stops.every((stop) => stop.mock.calls.length === 1)).toBe(true)
    native.invoke.mockResolvedValue(null)
    await initializeDesktopRuntime()
    expect(window.marklabTauri).toBeDefined()
  })

  it('routes named lifecycle/menu/opening operations and disposes their subscribers', async () => {
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await initializeDesktopRuntime()
    const api = window.marklabTauri!
    await api.appReady()
    expect(native.invoke).toHaveBeenLastCalledWith('app_ready', { request: { phase: 'shell' } })
    await api.lifecycle.getLaunchInfo()
    expect(native.invoke).toHaveBeenLastCalledWith('lifecycle_get_launch_info', { request: {} })
    await api.platform.get()
    expect(native.invoke).toHaveBeenLastCalledWith('app_get_platform', { request: {} })
    await api.menu.dispatch('file.new')
    expect(native.invoke).toHaveBeenLastCalledWith('menu_dispatch', { request: { id: 'file.new' } })
    await api.commands.invoke('fs_read_file', { path: 'note.md' })
    expect(native.invoke).toHaveBeenLastCalledWith('fs_read_file', { request: { path: 'note.md' } })
    const menu = vi.fn()
    const progress = vi.fn()
    const stopMenu = api.menu.onCommand(menu)
    const stopProgress = api.opening.onProgress(progress)
    native.handlers.get('menu-action')?.({ payload: 'edit.copy' })
    native.handlers.get('window-opening-progress')?.({ payload: { phase: 'loading' } })
    expect(menu).toHaveBeenCalledExactlyOnceWith('edit.copy')
    expect(progress).toHaveBeenCalledExactlyOnceWith({ phase: 'loading' })
    stopMenu()
    stopProgress()
    native.handlers.get('menu-action')?.({ payload: 'edit.cut' })
    native.handlers.get('window-opening-progress')?.({ payload: { phase: 'ready' } })
    expect(menu).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenCalledOnce()
    await api.opening.retry()
    expect(native.invoke).toHaveBeenLastCalledWith('retry_window_open', { request: {} })
  })

  it('keeps browser previews free of native initialization', async () => {
    native.isTauri.mockReturnValue(false)
    const { initializeDesktopRuntime } = await import('@/runtime/tauri')
    await initializeDesktopRuntime()
    expect(native.invoke).not.toHaveBeenCalled()
    expect(native.listen).not.toHaveBeenCalled()
    expect(window.marklabTauri).toBeUndefined()
  })
})
