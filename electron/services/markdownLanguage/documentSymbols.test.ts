import { describe, expect, it } from 'vitest'

import { getMarkdownDocumentSymbols } from '@electron/services/markdownLanguage/documentSymbols.js'

describe('getMarkdownDocumentSymbols', () => {
  it('builds nested document symbols from markdown headings', () => {
    expect(
      getMarkdownDocumentSymbols({
        path: 'notes/current.md',
        content: '# Project\n\n## Plan\n\n### Task\n\n## Notes\n',
      }),
    ).toEqual([
      expect.objectContaining({
        name: 'Project',
        level: 1,
        line: 1,
        column: 3,
        children: [
          expect.objectContaining({
            name: 'Plan',
            level: 2,
            line: 3,
            children: [
              expect.objectContaining({
                name: 'Task',
                level: 3,
                line: 5,
              }),
            ],
          }),
          expect.objectContaining({
            name: 'Notes',
            level: 2,
            line: 7,
          }),
        ],
      }),
    ])
  })
})
