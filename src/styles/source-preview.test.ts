// @ts-expect-error Vitest executes this stylesheet contract test in Node.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(path, 'utf8')

describe('source preview styles', () => {
  it('loads accessible syntax token colors in both color schemes', () => {
    const appStyles = readSource('src/styles/app.scss')
    const previewStyles = readSource('src/styles/app/_source-preview.scss')

    expect(appStyles).toContain("@use './app/source-preview';")
    expect(previewStyles).toContain('.source-preview-code .hljs-keyword')
    expect(previewStyles).toContain('.source-preview-code .hljs-string')
    expect(previewStyles).toContain('.source-preview-code .hljs-comment')
    expect(previewStyles).toContain('.dark .source-preview-code .hljs-keyword')
  })
})
