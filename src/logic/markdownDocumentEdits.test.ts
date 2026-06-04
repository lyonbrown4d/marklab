import { describe, expect, it } from 'vitest'
import {
  insertMarkdownHeadingAtLine,
  replaceMarkdownHeadingTitle,
  replaceMarkdownLineRange,
} from '@/logic/markdownDocumentEdits'

describe('replaceMarkdownHeadingTitle', () => {
  it('replaces a heading title at the given 1-based line', () => {
    expect(replaceMarkdownHeadingTitle('# Old\nBody', 1, 1, 'New')).toBe('# New\nBody')
  })

  it('normalizes pasted multiline heading text to one line', () => {
    expect(replaceMarkdownHeadingTitle('# Old\nBody', 1, 2, ' New \n Title ')).toBe(
      '## New Title\nBody',
    )
  })

  it('preserves original CRLF line endings', () => {
    expect(replaceMarkdownHeadingTitle('# Old\r\nBody\r\n', 1, 1, 'New')).toBe('# New\r\nBody\r\n')
  })

  it('returns original markdown for invalid heading coordinates', () => {
    expect(replaceMarkdownHeadingTitle('# Old\nBody', 0, 1, 'New')).toBe('# Old\nBody')
    expect(replaceMarkdownHeadingTitle('# Old\nBody', 3, 1, 'New')).toBe('# Old\nBody')
    expect(replaceMarkdownHeadingTitle('# Old\nBody', 1, 0, 'New')).toBe('# Old\nBody')
  })
})

describe('replaceMarkdownLineRange', () => {
  it('replaces an exclusive 1-based line range', () => {
    expect(replaceMarkdownLineRange('# Title\nOld one\nOld two\nTail', 2, 4, 'New')).toBe(
      '# Title\nNew\nTail',
    )
  })

  it('deletes a line range when content is empty', () => {
    expect(replaceMarkdownLineRange('# Title\nOld\nTail', 2, 3, '')).toBe('# Title\nTail')
  })

  it('preserves trailing newline when replacing content', () => {
    expect(replaceMarkdownLineRange('# Title\nOld\n', 2, 3, 'New')).toBe('# Title\nNew\n')
  })

  it('preserves original CRLF line endings for inserted multiline content', () => {
    expect(replaceMarkdownLineRange('# Title\r\nOld\r\nTail\r\n', 2, 3, 'A\nB')).toBe(
      '# Title\r\nA\r\nB\r\nTail\r\n',
    )
  })

  it('returns original markdown for invalid line ranges', () => {
    expect(replaceMarkdownLineRange('# Title\nOld', 0, 1, 'New')).toBe('# Title\nOld')
    expect(replaceMarkdownLineRange('# Title\nOld', 2, 1, 'New')).toBe('# Title\nOld')
  })
})

describe('insertMarkdownHeadingAtLine', () => {
  it('inserts a heading before the given 1-based line', () => {
    expect(insertMarkdownHeadingAtLine('# One\nBody\n# Two', 3, 2, 'Child')).toBe(
      '# One\nBody\n## Child\n# Two',
    )
  })

  it('appends a heading when the line is after the document end', () => {
    expect(insertMarkdownHeadingAtLine('# One\nBody', 20, 1, 'Next')).toBe('# One\nBody\n# Next')
  })

  it('preserves original CRLF line endings', () => {
    expect(insertMarkdownHeadingAtLine('# One\r\nBody\r\n', 2, 2, 'Child')).toBe(
      '# One\r\n## Child\r\nBody\r\n',
    )
  })

  it('returns original markdown for invalid heading coordinates', () => {
    expect(insertMarkdownHeadingAtLine('# One', 0, 2, 'Child')).toBe('# One')
    expect(insertMarkdownHeadingAtLine('# One', 1, 0, 'Child')).toBe('# One')
    expect(insertMarkdownHeadingAtLine('# One', 1, 7, 'Child')).toBe('# One')
  })
})
