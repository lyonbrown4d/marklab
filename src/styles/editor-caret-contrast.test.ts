// @ts-expect-error Vitest executes this stylesheet contract test in Node.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const themeStyles = readFileSync('src/index.scss', 'utf8')
const plateStyles = readFileSync('src/styles/plate-editor.scss', 'utf8')
const animatedCaretStyles = readFileSync('src/styles/plate-editor/cursor.scss', 'utf8')
const sourceEditorStyles = readFileSync('src/styles/source-editor.scss', 'utf8')
const mermaidEditorSource = readFileSync('src/components/previews/MermaidCodeEditor.tsx', 'utf8')

const parseHsl = (value: string): readonly [number, number, number] => {
  const [hue, saturation, lightness] = value.trim().split(/\s+/).map(Number.parseFloat)
  return [hue, saturation / 100, lightness / 100]
}

const hslToRgb = ([hue, saturation, lightness]: readonly [number, number, number]) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % 360) + 360) % 360) / 60
  const intermediate = chroma * (1 - Math.abs((sector % 2) - 1))
  const channels =
    sector < 1
      ? [chroma, intermediate, 0]
      : sector < 2
        ? [intermediate, chroma, 0]
        : sector < 3
          ? [0, chroma, intermediate]
          : sector < 4
            ? [0, intermediate, chroma]
            : sector < 5
              ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate]
  const match = lightness - chroma / 2
  return channels.map((channel) => channel + match)
}

const luminance = (value: string) =>
  hslToRgb(parseHsl(value))
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)

const contrast = (foreground: string, background: string) => {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const themeBlocks = [
  ...themeStyles.matchAll(/:root(?:\[data-theme='([^']+)'\])?\s*\{([\s\S]*?)\n\s*\}/g),
]

describe('editor caret contrast', () => {
  it('uses the high-contrast foreground token for native and animated Plate carets', () => {
    expect(plateStyles).toMatch(/caret-color:\s*hsl\(var\(--foreground\)\)/)
    expect(animatedCaretStyles).toMatch(/background:\s*hsl\(var\(--foreground\)\)/)
    expect(animatedCaretStyles).toMatch(
      /prefers-reduced-motion:[\s\S]*caret-color:\s*hsl\(var\(--foreground\)\)/,
    )
  })

  it('aligns the Monaco caret with the same high-contrast editor token', () => {
    expect(sourceEditorStyles).toMatch(
      /\.source-code-editor \.monaco-editor \.cursors-layer > \.cursor\s*\{[^}]*background-color:\s*hsl\(var\(--foreground\)\) !important;/s,
    )
    expect(sourceEditorStyles).toMatch(
      /\.source-code-editor \.monaco-editor \.inputarea\.ime-input\s*\{[^}]*caret-color:\s*hsl\(var\(--foreground\)\) !important;/s,
    )
  })

  it('gives the Mermaid CodeMirror caret a valid high-contrast HSL color', () => {
    expect(mermaidEditorSource).toContain("caretColor: 'hsl(var(--foreground))'")
    expect(mermaidEditorSource).toContain("borderLeftColor: 'hsl(var(--foreground))'")
    expect(mermaidEditorSource).not.toContain("caretColor: 'var(--primary)'")
  })

  it('keeps the foreground caret above 4.5:1 in every bundled theme', () => {
    const ratios = themeBlocks.map(([, name = 'default', declarations]) => {
      const background = declarations.match(/--background:\s*([^;]+)/)?.[1]
      const foreground = declarations.match(/--foreground:\s*([^;]+)/)?.[1]
      if (!background || !foreground) throw new Error(`Missing color tokens for ${name}`)
      return { name, ratio: contrast(foreground, background) }
    })

    expect(ratios.length).toBeGreaterThan(1)
    expect(ratios.filter(({ ratio }) => ratio < 4.5)).toEqual([])
  })
})
