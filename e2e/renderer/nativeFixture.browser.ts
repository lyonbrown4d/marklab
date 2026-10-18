import { emit } from '@tauri-apps/api/event'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

type Payload = Record<string, unknown>
type Host = {
  isTauri: boolean
  __marklabRendererFixtureInvoke: (command: string, args: Payload) => Promise<unknown>
  __marklabRendererFixture: { emit: typeof emit }
  __TAURI_INTERNALS__: { invoke: (command: string, args?: Payload) => Promise<unknown> }
}
const host = window as unknown as Host
host.isTauri = true
mockWindows('renderer-fixture')
mockIPC(
  async (command, args) => {
    if (command === 'plugin:window|scale_factor') return window.devicePixelRatio
    if (command === 'plugin:window|is_visible') return document.visibilityState === 'visible'
    if (command === 'plugin:window|is_maximized') return false
    if (
      args &&
      (typeof args !== 'object' || args instanceof ArrayBuffer || ArrayBuffer.isView(args))
    )
      throw new Error('Fixture expects an object request DTO')
    const result = await host.__marklabRendererFixtureInvoke(command, (args ?? {}) as Payload)
    if (
      command === 'fs_apply_buffer_update' &&
      result &&
      typeof result === 'object' &&
      'kind' in result &&
      result.kind === 'applied'
    ) {
      const status = { ...result } as Record<string, unknown>
      delete status.kind
      await emit('fs-buffer-status', status)
    }
    return result
  },
  { shouldMockEvents: true },
)
// api 2.12.4's mock unlisten reads `id`, whereas the public SDK sends
// `eventId`. Normalize this test-host mismatch; callback ownership remains SDK-owned.
const sdkInvoke = host.__TAURI_INTERNALS__.invoke
host.__TAURI_INTERNALS__.invoke = (command, args) =>
  sdkInvoke(command, command === 'plugin:event|unlisten' ? { ...args, id: args?.eventId } : args)
host.__marklabRendererFixture = { emit }
