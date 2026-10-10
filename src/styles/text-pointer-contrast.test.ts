import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const baseStyles = readFileSync('src/styles/app/_base.scss', 'utf8')
const pointerAssetPath = 'src/assets/cursors/text-high-contrast.svg'

describe('text pointer contrast', () => {
  it('uses a high-contrast I-beam across editable surfaces', () => {
    expect(baseStyles).toMatch(
      /cursor:\s*url\('\.\.\/\.\.\/assets\/cursors\/text-high-contrast\.svg'\) 12 12,\s*text;/,
    )
    expect(baseStyles).toContain("[contenteditable='true']")
    expect(baseStyles).toContain('.monaco-mouse-cursor-text')
    expect(baseStyles).toContain('.cm-content')
    expect(baseStyles).toContain('.cursor-text')
  })

  it('keeps the operating-system pointer in forced-colors mode', () => {
    expect(baseStyles).toMatch(/@media \(forced-colors: active\)[\s\S]*cursor:\s*text;[\s\S]*}/)
  })

  it('ships a naturally sized dual-tone SVG cursor', () => {
    expect(existsSync(pointerAssetPath)).toBe(true)
    const pointerAsset = existsSync(pointerAssetPath) ? readFileSync(pointerAssetPath, 'utf8') : ''
    expect(pointerAsset).toContain('width="24"')
    expect(pointerAsset).toContain('height="24"')
    expect(pointerAsset).toContain('stroke="#f8fafc"')
    expect(pointerAsset).toContain('stroke="#111827"')
  })
})
