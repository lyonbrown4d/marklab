// @ts-expect-error Vitest executes this style contract test in Node.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const readSource = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

const menuMotionStyles = readStyle('./app/_menu-motion.scss')
const editorPlaygroundStyles = readStyle('./editor-playground.scss')
const commandSource = readSource('../components/ui/command.tsx')

describe('menu motion styles', () => {
  it('animates menu surfaces in and out from their placement side', () => {
    expect(menuMotionStyles).toContain('@keyframes menu-surface-enter')
    expect(menuMotionStyles).toContain('@keyframes menu-surface-exit')
    expect(menuMotionStyles).toContain("&[data-side='bottom']")
    expect(menuMotionStyles).toContain("&[data-side='right']")
    expect(menuMotionStyles).toContain("&[data-state='open']")
    expect(menuMotionStyles).toContain("&[data-state='closed']")
  })

  it('gives highlighted items a short spatial response', () => {
    expect(menuMotionStyles).toContain('.menu-motion-item')
    expect(menuMotionStyles).toContain('&[data-highlighted]')
    expect(menuMotionStyles).toContain("&[data-selected='true']")
    expect(menuMotionStyles).toContain('translate3d(1px, 0, 0)')
    expect(commandSource).toContain('menu-motion-item')
  })

  it('honours the operating system reduced-motion preference', () => {
    expect(menuMotionStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(menuMotionStyles).toContain('animation: none')
    expect(menuMotionStyles).toContain('transition: none')
  })

  it('also animates the editor-owned menus that do not use Radix', () => {
    expect(editorPlaygroundStyles).toContain('@keyframes editor-menu-surface-enter')
    expect(editorPlaygroundStyles).toContain(".milkdown-slash-menu[data-show='true']")
    expect(editorPlaygroundStyles).toContain(".milkdown-toolbar[data-show='true']")
    expect(editorPlaygroundStyles).toContain(".milkdown-link-preview[data-show='true']")
    expect(editorPlaygroundStyles).toContain('.marklab-table-toolbar:not([hidden])')
  })
})
