import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { bindWindowWorkspaceAnalysisForeground } from '@electron/services/workspace/windowWorkspaceAnalysisForeground'

const createHarness = (
  initial: { focused?: boolean; visible?: boolean; minimized?: boolean } = {},
) => {
  const state = { focused: true, visible: true, minimized: false, ...initial }
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isFocused: () => state.focused,
    isVisible: () => state.visible,
    isMinimized: () => state.minimized,
  })
  const setForeground = vi.fn()
  const dispose = bindWindowWorkspaceAnalysisForeground(
    window as unknown as BrowserWindow,
    setForeground,
  )
  return { dispose, setForeground, state, window }
}

describe('native window analysis activity binding', () => {
  it('starts suspended for background, hidden, or minimized windows', () => {
    for (const state of [{ focused: false }, { visible: false }, { minimized: true }]) {
      const { dispose, setForeground } = createHarness(state)
      expect(setForeground).toHaveBeenLastCalledWith(false)
      dispose()
    }
  })

  it('resumes only when native focus, visibility, and minimized state permit it', () => {
    const { dispose, setForeground, state, window } = createHarness()
    expect(setForeground).toHaveBeenLastCalledWith(true)
    state.focused = false
    window.emit('blur')
    expect(setForeground).toHaveBeenLastCalledWith(false)
    window.emit('show')
    expect(setForeground).toHaveBeenLastCalledWith(false)
    state.focused = true
    window.emit('focus')
    expect(setForeground).toHaveBeenLastCalledWith(true)
    state.minimized = true
    window.emit('minimize')
    expect(setForeground).toHaveBeenLastCalledWith(false)
    state.minimized = false
    state.visible = false
    window.emit('restore')
    expect(setForeground).toHaveBeenLastCalledWith(false)
    state.visible = true
    window.emit('show')
    expect(setForeground).toHaveBeenLastCalledWith(true)
    window.emit('hide')
    expect(setForeground).toHaveBeenLastCalledWith(false)
    dispose()
    expect(window.eventNames()).toEqual([])
  })
})
