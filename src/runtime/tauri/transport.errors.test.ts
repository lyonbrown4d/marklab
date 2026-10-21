import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventHub, invokeWorkspaceCommand, request } from '@/runtime/tauri/transport'

const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
beforeEach(() => native.invoke.mockReset().mockResolvedValue({ ok: true }))
const nativeErrors: Array<[unknown, string]> = [
  ['Native denied', 'Native denied'],
  [null, 'Desktop operation failed.'],
  [{ message: 42 }, 'Desktop operation failed.'],
  [{ message: 'Permission denied', code: 12 }, 'Permission denied'],
]

describe('native IPC error and binary boundaries', () => {
  it('transfers only a typed-array view without leaking adjacent bytes', async () => {
    const source = new Uint8Array([10, 20, 30, 40])
    await invokeWorkspaceCommand('fs_import_markdown_asset_bytes', {
      fileName: 'view.bin',
      documentPath: 'note.md',
      bytes: source.subarray(1, 3),
    })
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('fs_import_markdown_asset_bytes', {
      request: { fileName: 'view.bin', documentPath: 'note.md', bytes: [20, 30] },
    })
  })

  it('rejects JSON-shaped binary substitutes before any native operation', async () => {
    await expect(
      invokeWorkspaceCommand('fs_import_markdown_asset_bytes', {
        fileName: 'invalid.bin',
        documentPath: 'note.md',
        // @ts-expect-error Exercise the runtime boundary for untyped callers.
        bytes: [1, 2],
      }),
    ).rejects.toThrow('Asset import requires binary bytes.')
    expect(native.invoke).not.toHaveBeenCalled()
  })

  it.each(nativeErrors)(
    'normalizes rejected native payload %j into an actionable Error',
    async (rejection, expected) => {
      native.invoke.mockRejectedValueOnce(rejection)
      await expect(request('fs_read_file', { path: 'note.md' })).rejects.toThrow(expected)
    },
  )

  it('preserves existing Error identity across native IPC', async () => {
    const error = new Error('Connection closed')
    native.invoke.mockRejectedValueOnce(error)
    await expect(request('window_flush_result', { requestId: 'quit' })).rejects.toBe(error)
  })

  it('releases cached startup payloads and payload subscribers on disposal', () => {
    const hub = createEventHub()
    expect(hub.attempt()).toBeUndefined()
    hub.publish('workspace-session-seed', { state: {}, nativeAttempt: 2 })
    const receive = vi.fn()
    hub.on('workspace-session-seed', receive)
    expect(receive).toHaveBeenCalledOnce()
    hub.dispose()
    expect(hub.has('workspace-session-seed')).toBe(false)
    hub.publish('workspace-session-seed', { state: { rootPath: '/late' }, nativeAttempt: 3 })
    expect(receive).toHaveBeenCalledOnce()
    hub.dispose()
  })
})
