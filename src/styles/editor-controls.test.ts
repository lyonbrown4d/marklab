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

  it('pauses focus-mode dimming and animated caret while block dragging', () => {
    expect(editorStyles).toMatch(
      /\.crepe\[data-editor-dragging='true'\]\.is-focus-editor \.milkdown \.marklab-md-block\s*{[\s\S]*?opacity: 1;/,
    )
    expect(editorStyles).toMatch(
      /\.crepe\[data-editor-dragging='true'\] \.marklab-animated-caret\s*{[\s\S]*?display: none;/,
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

  it('uses a JS positioned block drop indicator instead of block pseudo-elements', () => {
    expect(controlStyles).not.toContain('left: -1.15rem')
    expect(controlStyles).not.toContain("data-drop-position='before'")
    expect(controlStyles).toContain('--editor-block-drop-indicator-gutter-offset: -38px')
    expect(controlStyles).toMatch(
      /\.marklab-editor-drop-indicator\s*{[\s\S]*?position: fixed;[\s\S]*?transform: translate3d\(/,
    )
  })

  it('hides Milkdown native block drag lines when the JS indicator is enabled', () => {
    expect(controlStyles).toMatch(
      /\.is-js-drop-indicator \.milkdown \.milkdown-drag-line,[\s\S]*?\.is-js-drop-indicator \.milkdown \.milkdown-block-drop-line\s*{[\s\S]*?display: none !important;[\s\S]*?opacity: 0 !important;/,
    )
    expect(controlStyles).toMatch(
      /\.is-js-drop-indicator \.milkdown \.ProseMirror-dropcursor,[\s\S]*?\.is-js-drop-indicator \.milkdown \.milkdown-drop-cursor\s*{[\s\S]*?display: none !important;/,
    )
    expect(controlStyles).not.toContain('right: 0 !important')
    expect(controlStyles).not.toContain('width: auto !important')
  })

  it('keeps the existing block hover rail as the only before pseudo-element alignment source', () => {
    expect(controlStyles).toContain('--editor-block-rail-offset: -0.375rem')
    expect(controlStyles).toMatch(
      /\.marklab-md-block::before\s*{[\s\S]*?left: var\(--editor-block-rail-offset\);/,
    )
    expect(controlStyles).not.toContain('.ProseMirror .marklab-md-block::before')
  })
})
