// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('editor interaction styles', () => {
  const editorStyles = readStyle('./editor.scss')
  const controlStyles = readStyle('./editor-controls.scss')

  it('uses fonts that are imported by the app stylesheet', () => {
    expect(editorStyles).not.toContain('Manrope')
    expect(editorStyles).toContain("--editor-prose-font: 'Atkinson Hyperlegible'")
    expect(editorStyles).toContain("--editor-code-font: 'JetBrains Mono'")
  })

  it('keeps selected and focused blocks visually quiet', () => {
    expect(controlStyles).toMatch(
      /\.marklab-md-block:hover,\s*\.crepe \.milkdown \.marklab-md-block:focus-within,\s*\.crepe \.milkdown \.marklab-md-block\[data-selected='true'\]\s*{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
    )
  })

  it('keeps block handles independent from theme-specific class overrides', () => {
    expect(controlStyles).not.toContain('.dark .crepe .milkdown')
    expect(controlStyles).toMatch(
      /\.milkdown-block-handle\[data-show='true'\],[\s\S]*?{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
    )
  })

  it('places the plus and drag separator between controls instead of over an icon', () => {
    expect(controlStyles).toMatch(
      /\.milkdown-block-handle \.operation-item \+ \.operation-item::before\s*{[\s\S]*?left: -1px;/,
    )
  })
})
