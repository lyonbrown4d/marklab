import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTarget, Options } from '@tauri-apps/api/event'
import { createEventHub, invokeWorkspaceCommand, nativeEvents } from '@/runtime/tauri/transport'
import { createGitApi } from '@/runtime/tauri/git'

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  stops: [] as ReturnType<typeof vi.fn>[],
  rootLabel: 'main',
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: native.rootLabel }) }))

beforeEach(() => {
  native.invoke.mockReset().mockResolvedValue({ ok: true })
  native.handlers.clear()
  native.stops = []
  native.rootLabel = 'main'
  native.listen.mockReset().mockImplementation(async (name, handler) => {
    native.handlers.set(name, handler)
    const stop = vi.fn()
    native.stops.push(stop)
    return stop
  })
})

describe('Tauri command boundary', () => {
  it('serializes only the binary asset DTO and rejects oversized imports before invoking Rust', async () => {
    const bytes = new Uint8Array([0, 127, 255])
    await invokeWorkspaceCommand('fs_import_markdown_asset_bytes', {
      fileName: 'image.png',
      bytes: bytes.buffer,
    })
    expect(native.invoke).toHaveBeenLastCalledWith('fs_import_markdown_asset_bytes', {
      request: { fileName: 'image.png', bytes: [0, 127, 255] },
    })
    native.invoke.mockClear()
    await expect(
      invokeWorkspaceCommand('fs_import_markdown_asset_bytes', {
        bytes: new Uint8Array(32 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow('32 MiB')
    expect(native.invoke).not.toHaveBeenCalled()
  })

  it('preserves structured Rust error messages and codes for existing UI error states', async () => {
    native.invoke.mockRejectedValueOnce({ code: 'STALE_SESSION', message: 'Workspace changed' })
    const error = await invokeWorkspaceCommand('fs_read_file', { path: 'notes.md' }).catch(
      (error: unknown) => error,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ code: 'STALE_SESSION', message: 'Workspace changed' })
  })

  it('preserves DTOs and maps legacy names without exposing arbitrary native commands', async () => {
    await invokeWorkspaceCommand('fs_read_file', { path: 'notes.md' })
    await invokeWorkspaceCommand('knowledge.engine.workspaceStatus')
    expect(native.invoke.mock.calls).toEqual([
      ['fs_read_file', { request: { path: 'notes.md' } }],
      ['knowledge_engine_workspace_status', { request: {} }],
    ])
    native.invoke.mockClear()
    await expect(invokeWorkspaceCommand('plugin:shell|execute', { command: 'sh' })).rejects.toThrow(
      'Unsupported command',
    )
    expect(native.invoke).not.toHaveBeenCalled()
  })

  it('keeps git workspace scope and conflict/stash safety fields across the transport', async () => {
    const git = createGitApi()
    await git.applyStash('stash@{0}', '/workspace', 'expected-hash')
    await git.commitDiff('commit', 'new.md', 'old.md', '/workspace')
    expect(native.invoke.mock.calls).toEqual([
      [
        'git_stash_apply',
        {
          request: {
            ref: 'stash@{0}',
            expectedHash: 'expected-hash',
            expectedRoot: '/workspace',
          },
        },
      ],
      [
        'git_commit_diff',
        {
          request: {
            commit: 'commit',
            path: 'new.md',
            oldPath: 'old.md',
            expectedRoot: '/workspace',
          },
        },
      ],
    ])
    native.invoke.mockRejectedValueOnce(new Error('Workspace scope changed'))
    await expect(git.stage(['notes.md'], '/previous')).rejects.toThrow('Workspace scope changed')
  })
})

describe('Tauri event bridge', () => {
  it('targets every native subscription to its exact root WebviewWindow', async () => {
    native.rootLabel = 'workspace-root-42'
    const hub = createEventHub()
    await hub.install()
    expect(native.listen).toHaveBeenCalledTimes(nativeEvents.length)
    for (const [index, name] of nativeEvents.entries()) {
      expect(native.listen).toHaveBeenNthCalledWith(index + 1, name, expect.any(Function), {
        target: { kind: 'WebviewWindow', label: 'workspace-root-42' },
      })
    }
    hub.dispose()
  })

  it('keeps same-generation owner events separate while accepting app broadcasts', async () => {
    const registrations: Array<{
      name: string
      target?: Options['target']
      receive: (event: { payload: unknown }) => void
    }> = []
    native.listen.mockImplementation(async (name, receive, options?: Options) => {
      registrations.push({ name, receive, target: options?.target })
      return vi.fn()
    })
    const first = createEventHub()
    native.rootLabel = 'workspace-a'
    await first.install()
    const second = createEventHub()
    native.rootLabel = 'workspace-b'
    await second.install()
    const firstMenu = vi.fn()
    const secondMenu = vi.fn()
    const firstSeed = vi.fn()
    const secondSeed = vi.fn()
    const firstGlobal = vi.fn()
    const secondGlobal = vi.fn()
    first.on('menu-action', firstMenu)
    second.on('menu-action', secondMenu)
    first.on('workspace-session-seed', firstSeed)
    second.on('workspace-session-seed', secondSeed)
    first.on('recent-workspaces-changed', firstGlobal)
    second.on('recent-workspaces-changed', secondGlobal)
    // Tauri sends app broadcasts to all targets, and unscoped Any listeners
    // receive even owner-targeted events. Match that boundary in this fixture.
    const emit = (target: EventTarget, name: string, payload: unknown) => {
      for (const registration of registrations) {
        if (registration.name !== name) continue
        const subscribed =
          typeof registration.target === 'string'
            ? { kind: 'AnyLabel', label: registration.target }
            : registration.target
        if (
          target.kind === 'Any' ||
          !subscribed ||
          subscribed.kind === 'Any' ||
          ((subscribed.kind === target.kind || subscribed.kind === 'AnyLabel') &&
            'label' in subscribed &&
            'label' in target &&
            subscribed.label === target.label)
        ) {
          registration.receive({ payload })
        }
      }
    }
    emit({ kind: 'WebviewWindow', label: 'workspace-a' }, 'menu-action', 'edit.paste')
    emit({ kind: 'WebviewWindow', label: 'workspace-a' }, 'workspace-session-seed', {
      state: { rootPath: '/a' },
      nativeAttempt: 1,
      nativeGeneration: 1,
    })
    emit({ kind: 'Webview', label: 'workspace-a' }, 'menu-action', 'edit.cut')
    emit({ kind: 'WebviewWindow', label: 'workspace-b' }, 'workspace-session-seed', {
      state: { rootPath: '/b' },
      nativeAttempt: 1,
      nativeGeneration: 1,
    })
    emit({ kind: 'Any' }, 'recent-workspaces-changed', { updated: true })
    expect(firstMenu).toHaveBeenCalledExactlyOnceWith('edit.paste')
    expect(secondMenu).not.toHaveBeenCalled()
    expect(firstSeed).toHaveBeenCalledExactlyOnceWith({ state: { rootPath: '/a' } })
    expect(secondSeed).toHaveBeenCalledExactlyOnceWith({ state: { rootPath: '/b' } })
    expect(firstGlobal).toHaveBeenCalledExactlyOnceWith({ updated: true })
    expect(secondGlobal).toHaveBeenCalledExactlyOnceWith({ updated: true })
    first.dispose()
    second.dispose()
  })

  it('replays early seeds, preserves envelopes, and removes subscribers', async () => {
    const hub = createEventHub()
    await hub.install()
    const seed = { state: { workspacePath: '/workspace' }, version: 4 }
    native.handlers.get('workspace-session-seed')?.({ payload: seed })
    const handler = vi.fn()
    const stop = hub.subscribe('workspace-session-seed', handler)
    expect(handler).toHaveBeenCalledWith({
      event: 'workspace-session-seed',
      id: 1,
      payload: seed,
    })
    stop()
    native.handlers.get('workspace-session-seed')?.({ payload: { version: 5 } })
    expect(handler).toHaveBeenCalledOnce()
    expect(() => hub.subscribe('arbitrary-event', handler)).toThrow('Unsupported event')
    hub.dispose()
    expect(native.stops.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
  })

  it('releases installed subscriptions when native listener setup fails', async () => {
    const stop = vi.fn()
    native.listen
      .mockReset()
      .mockResolvedValueOnce(stop)
      .mockRejectedValueOnce(new Error('Event permission denied'))
    await expect(createEventHub().install()).rejects.toThrow('Event permission denied')
    expect(stop).toHaveBeenCalledOnce()
  })
})

it('keeps native readiness attempts private and rejects older workspace seeds', () => {
  const hub = createEventHub()
  const receive = vi.fn()
  hub.on('workspace-session-seed', receive)
  hub.publish('workspace-session-seed', { rootPath: '/new', nativeAttempt: 4 })
  hub.publish('workspace-session-seed', { rootPath: '/old', nativeAttempt: 3 })
  expect(hub.attempt()).toBe(4)
  expect(receive).toHaveBeenCalledOnce()
  expect(receive).toHaveBeenCalledWith({ rootPath: '/new' })
})

it('adapts real Rust buffer status DTOs and rejects late events from another workspace', async () => {
  const { fsBufferStatusSchema } = await import('@/services/fsApiSchemas')
  const hub = createEventHub()
  const receive = vi.fn((payload: unknown) => fsBufferStatusSchema.parse(payload))
  hub.on('fs-buffer-status', receive)
  hub.publish('workspace-session-seed', { state: {}, nativeAttempt: 2, nativeGeneration: 8 })
  hub.publish('fs-buffer-status', {
    path: 'same.md',
    revision: 3,
    dirty: true,
    session_generation: 8,
  })
  expect(receive).toHaveBeenCalledWith({ path: 'same.md', revision: 3, dirty: true })
  hub.publish('workspace-generation-changed', { generation: 4 })
  hub.publish('fs-buffer-status', {
    path: 'same.md',
    revision: 9,
    dirty: false,
    session_generation: 8,
  })
  hub.publish('fs-buffer-status', {
    path: 'same.md',
    revision: 1,
    dirty: false,
    session_generation: 4,
  })
  expect(receive).toHaveBeenCalledTimes(2)
  expect(receive).toHaveBeenLastCalledWith({ path: 'same.md', revision: 1, dirty: false })
})
