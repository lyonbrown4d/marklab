import { describe, expect, it } from 'vitest'

import {
  compileWebTabShortcutBindings,
  findWebTabShortcutAction,
} from '@electron/services/webTabs/webTabShortcuts'

describe('web tab shortcut matching', () => {
  it('resolves Mod to Control on Windows and Linux', () => {
    const bindings = compileWebTabShortcutBindings(
      { 'app.commandPalette': ['Mod+Shift+P'] },
      'win32',
    )
    expect(
      findWebTabShortcutAction(bindings, input({ control: true, key: 'P', shift: true })),
    ).toBe('app.commandPalette')
    expect(
      findWebTabShortcutAction(bindings, input({ key: 'P', meta: true, shift: true })),
    ).toBeNull()
  })

  it('resolves Mod to Meta on macOS and supports custom overrides', () => {
    const bindings = compileWebTabShortcutBindings(
      { 'app.settings': ['Mod+Alt+,'], 'file.openFile': ['Control+Shift+O'] },
      'darwin',
    )
    expect(findWebTabShortcutAction(bindings, input({ alt: true, key: ',', meta: true }))).toBe(
      'app.settings',
    )
    expect(
      findWebTabShortcutAction(bindings, input({ control: true, key: 'o', shift: true })),
    ).toBe('file.openFile')
  })

  it('preserves web editing shortcuts and ignores IME, repeats, and key-up', () => {
    const bindings = compileWebTabShortcutBindings(
      { 'app.settings': ['Mod+C', 'Mod+F', 'Mod+P'] },
      'win32',
    )
    expect(findWebTabShortcutAction(bindings, input({ control: true, key: 'c' }))).toBeNull()
    expect(findWebTabShortcutAction(bindings, input({ control: true, key: 'f' }))).toBeNull()
    expect(
      findWebTabShortcutAction(bindings, input({ control: true, isComposing: true, key: 'p' })),
    ).toBeNull()
    expect(
      findWebTabShortcutAction(bindings, input({ control: true, isAutoRepeat: true, key: 'p' })),
    ).toBeNull()
    expect(
      findWebTabShortcutAction(bindings, input({ control: true, key: 'p', type: 'keyUp' })),
    ).toBeNull()
  })

  it('uses the last binding when app actions conflict', () => {
    const bindings = compileWebTabShortcutBindings(
      { 'app.commandPalette': ['Mod+K'], 'app.settings': ['Mod+K'] },
      'win32',
    )
    expect(findWebTabShortcutAction(bindings, input({ control: true, key: 'k' }))).toBe(
      'app.settings',
    )
  })
})

const input = (overrides: Partial<Electron.Input>): Electron.Input => ({
  alt: false,
  code: '',
  control: false,
  isAutoRepeat: false,
  isComposing: false,
  key: '',
  location: 0,
  meta: false,
  modifiers: [],
  shift: false,
  type: 'keyDown',
  ...overrides,
})
