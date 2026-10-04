// @ts-expect-error Vitest executes this stylesheet contract test in Node.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stylePath = 'src/styles/plate-editor.scss'
const codeHighlightStylePath = 'src/styles/plate-editor/code-highlight.scss'
const modesStylePath = 'src/styles/plate-editor/modes.scss'
const mainSource = readFileSync('src/main.tsx', 'utf8') as string

describe('Plate editor styles', () => {
  it('loads the dedicated Plate stylesheet from the renderer entrypoint', () => {
    expect(existsSync(stylePath)).toBe(true)
    expect(mainSource).toContain("import '@/styles/plate-editor.scss'")
    expect(mainSource).not.toContain("import '@/styles/editor-playground.scss'")
  })

  it('targets the stable Marklab and Slate contracts without Milkdown internals', () => {
    expect(existsSync(stylePath)).toBe(true)
    if (!existsSync(stylePath)) return

    const styles = readFileSync(stylePath, 'utf8') as string
    expect(styles).toContain('.markdown-editor')
    expect(styles).toContain("[data-slate-node='element']")
    expect(styles).toContain("[data-slate-chunk='true']")
    expect(styles).toContain("@use './plate-editor/code-highlight';")
    expect(styles).toContain("@use './plate-editor/completion';")
    expect(styles).toContain("@use './plate-editor/pdf-preview';")
    expect(styles).not.toContain('.milkdown')
    expect(styles).not.toContain('.ProseMirror')
  })

  it('styles lowlight syntax tokens within the Plate editor', () => {
    const styles = readFileSync(codeHighlightStylePath, 'utf8') as string

    expect(styles).toContain('.markdown-editor .hljs-keyword')
    expect(styles).toContain('.markdown-editor .hljs-string')
    expect(styles).toContain('.markdown-editor .hljs-comment')
    expect(styles).toContain('.markdown-editor .hljs-number')
  })

  it('keeps readonly typewriter snapping and focus mode compatible with chunks', () => {
    const styles = readFileSync(modesStylePath, 'utf8') as string

    expect(styles).toMatch(
      /\.markdown-editor\.is-readonly-editor\s*\{[^}]*scroll-snap-type:\s*y proximity;/s,
    )
    expect(styles).toMatch(
      /\.markdown-editor\.is-readonly-editor\s*>\s*\[data-slate-node='element'\],\s*\.markdown-editor\.is-readonly-editor\s*>\s*\[data-slate-chunk='true'\]\s*>\s*\[data-slate-node='element'\]\s*\{[^}]*scroll-snap-align:\s*center;/s,
    )
    expect(styles).not.toContain(
      ".markdown-editor.is-readonly-editor > [data-slate-chunk='true'] {\n  scroll-margin-block",
    )
    expect(styles).toMatch(
      /\.markdown-editor\.is-focus-editor\[data-focus-active='true'\]\s*>\s*\.plate-block-draggable:not\(\[data-focus-active='true'\]\),\s*\.markdown-editor\.is-focus-editor\[data-focus-active='true'\]\s*>\s*\[data-slate-chunk='true'\]\s*>\s*\.plate-block-draggable:not\(\[data-focus-active='true'\]\)\s*\{\s*opacity:\s*0\.42;/s,
    )
    expect(styles).toMatch(
      /\.markdown-editor\.is-focus-editor\s*>\s*\.plate-block-draggable,\s*\.markdown-editor\.is-focus-editor\s*>\s*\[data-slate-chunk='true'\]\s*>\s*\.plate-block-draggable\s*\{\s*transition:\s*opacity 160ms ease;/s,
    )
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.markdown-editor\.is-readonly-editor\s*\{\s*scroll-snap-type:\s*none;/,
    )
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.markdown-editor\.is-focus-editor > \.plate-block-draggable,[\s\S]*\.markdown-editor\.is-focus-editor > \[data-slate-chunk='true'\] > \.plate-block-draggable \{\s*transition:\s*none;/,
    )
  })

  it('keeps draggable blocks inside the normal and embedded reading widths', () => {
    const styles = readFileSync(stylePath, 'utf8') as string

    expect(styles).toMatch(
      /\.markdown-editor > \[data-slate-node='element'\],\s*\.markdown-editor > \.plate-block-draggable,\s*\.markdown-editor > \[data-slate-chunk='true'\] \{\s*width: min\(100%, 780px\);/s,
    )
    expect(styles).toMatch(
      /\.markdown-editor--embedded > \[data-slate-node='element'\],\s*\.markdown-editor--embedded > \.plate-block-draggable,\s*\.markdown-editor--embedded > \[data-slate-chunk='true'\] \{\s*width: min\(100%, 680px\);/s,
    )
  })
})
