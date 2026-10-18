import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

describe('native window capability boundary', () => {
  it('gates every custom command before dispatch, including commands without a window argument', () => {
    const handler = fileText('../../src-tauri/src/desktop/invoke.rs')
    const gate = handler.indexOf('if !crate::native_window::is_trusted(&invoke.message.webview())')
    const dispatch = handler.lastIndexOf('handler(invoke)')
    expect(gate).toBeGreaterThan(0)
    expect(dispatch).toBeGreaterThan(gate)
    expect(handler.slice(gate, dispatch)).toContain('.reject(')
    expect(handler.slice(gate, dispatch)).toContain('return true')
  })

  it('requires registered root identity, trusted document URLs, and no URL credentials', () => {
    const native = fileText('../../src-tauri/src/native_window.rs')
    expect(native).toContain('webview.label() != window.label()')
    expect(native).toContain('get(webview.app_handle(), window.label()).is_none()')
    expect(native).toContain('!url.username().is_empty() || url.password().is_some()')
    expect(native).toContain('url.scheme() == "tauri" && url.host_str() == Some("localhost")')
    expect(native).toContain('url.host_str() == Some("tauri.localhost")')
    expect(native).toContain('cfg!(debug_assertions)')
    expect(native).toContain('url.port() == Some(5173)')
    expect(native).toContain('["", "index.html", "window-opening.html", "splashscreen.html"]')
  })

  it('grants plugin permissions only to root webviews, never every child sharing a window', () => {
    const capability = JSON.parse(fileText('../../src-tauri/capabilities/desktop.json')) as {
      windows?: string[]
      webviews: string[]
      remote?: unknown
    }
    expect(capability.windows).toBeUndefined()
    expect(capability.remote).toBeUndefined()
    expect(capability.webviews).toEqual(['main', 'workspace-*', 'opening-*', 'splash'])
    const scopedEvents = fileText('../../src-tauri/src/workspace/event_tests.rs')
    expect(scopedEvents).toContain(
      'shared_workspace_events_reach_each_owner_once_and_never_another_root_or_child',
    )
  })
})
