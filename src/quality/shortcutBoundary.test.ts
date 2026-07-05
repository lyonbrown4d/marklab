// @ts-expect-error Vitest runs this repository guard in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shortcutActions } from '@/logic/shortcuts'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('shortcut boundary', () => {
  it('keeps every app-scoped shortcut handled by the global shortcut hook', () => {
    const source = fileText('../app/useKeyboardShortcuts.ts')
    const appActionIds = shortcutActions
      .filter((action) => action.scope === 'app')
      .map((action) => action.id)

    appActionIds.forEach((actionId) => {
      expect(source, actionId).toContain(`'${actionId}'`)
    })
  })
})
