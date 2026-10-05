import { describe, expect, it } from 'vitest'
import {
  highlightSourceLines,
  MAX_SOURCE_HIGHLIGHT_LINES,
  type SourceHighlightLine,
} from '@/components/previews/sourceHighlight'

const textOf = (line: SourceHighlightLine) => line.map((fragment) => fragment.text).join('')
const classesOf = (line: SourceHighlightLine) => line.flatMap((fragment) => fragment.classNames)

describe('highlightSourceLines', () => {
  it.each([
    ['gradle', "plugins { id 'java' }", 'hljs-string'],
    ['properties', 'server.port=8080', 'hljs-attr'],
    ['protobuf', 'message User { string name = 1; }', 'hljs-keyword'],
    ['graphql', 'type Query { user: User }', 'hljs-symbol'],
    ['dockerfile', 'FROM node:22', 'hljs-keyword'],
    ['makefile', 'build:', 'hljs-section'],
  ])('highlights %s source with its registered grammar', (language, source, tokenClass) => {
    const [line] = highlightSourceLines([source], language)

    expect(line).toBeDefined()
    expect(textOf(line ?? [])).toBe(source)
    expect(classesOf(line ?? [])).toContain(tokenClass)
  })

  it.each(['plaintext', 'not-a-real-language'])('falls back to plain text for %s', (language) => {
    expect(highlightSourceLines(['const value = 1'], language)).toEqual([
      [{ classNames: [], text: 'const value = 1' }],
    ])
  })

  it('leaves the tail plain after the highlighting line budget', () => {
    const lines = Array.from(
      { length: MAX_SOURCE_HIGHLIGHT_LINES + 1 },
      (_, index) => `const value${index} = ${index}`,
    )
    const highlighted = highlightSourceLines(lines, 'typescript')

    expect(classesOf(highlighted[MAX_SOURCE_HIGHLIGHT_LINES - 1] ?? [])).toContain('hljs-keyword')
    expect(highlighted[MAX_SOURCE_HIGHLIGHT_LINES]).toEqual([
      { classNames: [], text: lines[MAX_SOURCE_HIGHLIGHT_LINES] },
    ])
  })

  it('preserves empty lines and a trailing newline', () => {
    const highlighted = highlightSourceLines(['const value = 1', '', ''], 'typescript')

    expect(highlighted).toHaveLength(3)
    expect(highlighted.map(textOf)).toEqual(['const value = 1', '', ''])
  })

  it('only exposes allowlisted highlight.js token classes', () => {
    const highlighted = highlightSourceLines(['FROM node:22', 'RUN npm install'], 'dockerfile')
    const classes = highlighted.flatMap(classesOf)

    expect(classes).toContain('hljs-keyword')
    expect(classes).not.toContain('bash')
    expect(classes.every((className) => /^hljs-[a-z0-9_-]+$/i.test(className))).toBe(true)
  })
})
