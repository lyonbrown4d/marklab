import { expectTypeOf, it } from 'vitest'
import type { Observable } from 'rxjs'
import { invoke } from '@/runtime/ipc'
import { listen, type RuntimeEvent } from '@/runtime/events'
import { request } from '@/runtime/tauri/transport'
import { fromRuntimeEvent } from '@/lib/runtimeObservable'
import type { DesktopCommandResults, DesktopEventPayloads } from '@/generated/desktop/bindings'

// TypeScript checks these calls without running native operations during the test.
const checkContracts = () => {
  expectTypeOf(invoke('fs_read_file', { path: 'note.md' })).toEqualTypeOf<Promise<string>>()
  expectTypeOf(request('terminal_create', { rows: 24, cols: 80 })).toEqualTypeOf<
    Promise<DesktopCommandResults['terminal_create']>
  >()
  // @ts-expect-error The native adapter also requires nonempty Rust request DTOs.
  request('terminal_create')
  // @ts-expect-error Commands must exist in the Rust registry.
  invoke('plugin:shell|execute', { command: 'sh' })
  // @ts-expect-error Required Rust request fields cannot be omitted.
  invoke('fs_read_file')
  // @ts-expect-error Request fields are checked against the selected Rust command.
  invoke('fs_read_file', { path: 123 })
  // @ts-expect-error Empty Rust requests cannot carry arbitrary fields.
  invoke('fs_get_snapshot', { unexpected: true })
  // @ts-expect-error Callers cannot invent a result type for an existing command.
  const inventedResult: Promise<number> = invoke('fs_read_file', { path: 'note.md' })
  void inventedResult
  // @ts-expect-error Unknown application events cannot enter the native listener bridge.
  listen('arbitrary-event', () => {})
  // @ts-expect-error Reactive event consumers use the same generated event names.
  fromRuntimeEvent('arbitrary-event')
  expectTypeOf(fromRuntimeEvent('terminal-output')).toEqualTypeOf<
    Observable<RuntimeEvent<DesktopEventPayloads['terminal-output']>>
  >()
  listen('terminal-output', ({ payload }) => {
    expectTypeOf(payload).toEqualTypeOf<DesktopEventPayloads['terminal-output']>()
    // @ts-expect-error Event payload properties are generated from Rust.
    const invalid: number = payload.data
    void invalid
  })
}

it('keeps command and event contracts checked by the TypeScript compiler', () => {
  expectTypeOf(checkContracts).toBeFunction()
})
