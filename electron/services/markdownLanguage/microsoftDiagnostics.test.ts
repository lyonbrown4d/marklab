import { describe, expect, it } from 'vitest'

import { computeMicrosoftReferenceDiagnostics } from '@electron/services/markdownLanguage/microsoftDiagnostics'

describe('computeMicrosoftReferenceDiagnostics', () => {
  it('reports missing, unused, and duplicate reference definitions only', async () => {
    const diagnostics = await computeMicrosoftReferenceDiagnostics({
      content: [
        '[Missing][no-such-ref]',
        '',
        '[unused]: https://example.com',
        '[dup]: https://first.example.com',
        '[dup]: https://second.example.com',
        '[File](missing.md#missing-heading)',
      ].join('\n'),
      path: 'notes/current.md',
    })

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "No link definition found: 'no-such-ref'",
        'Link definition is unused',
        "Link definition for 'dup' already exists",
      ]),
    )
    expect(diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/file|heading/i) }),
      ]),
    )
  })

  it('accepts a valid reference definition', async () => {
    await expect(
      computeMicrosoftReferenceDiagnostics({
        content: '[Marklab][project]\n\n[project]: https://example.com/marklab',
        path: 'valid.md',
      }),
    ).resolves.toEqual([])
  })

  it('does not interpret reference-looking text in fenced code blocks', async () => {
    await expect(
      computeMicrosoftReferenceDiagnostics({
        content: ['```md', '[Missing][inside-fence]', '[unused]: value', '```'].join('\n'),
        path: 'fenced.md',
      }),
    ).resolves.toEqual([])
  })

  it('keeps UTF-16 columns correct across Chinese text, emoji, and CRLF', async () => {
    const diagnostics = await computeMicrosoftReferenceDiagnostics({
      content: '😀中文 [标签][缺失]\r\n下一行',
      path: '中文.md',
    })

    expect(diagnostics).toEqual([
      expect.objectContaining({
        end_column: 13,
        line: 1,
        start_column: 11,
      }),
    ])
  })

  it('does not report wiki links or GFM task syntax as reference failures', async () => {
    await expect(
      computeMicrosoftReferenceDiagnostics({
        content: ['- [x] 完成', '', 'See [[Wiki Note#Heading]].'].join('\n'),
        path: 'gfm.md',
      }),
    ).resolves.toEqual([])
  })

  it('isolates concurrent document requests', async () => {
    const [alpha, beta] = await Promise.all([
      computeMicrosoftReferenceDiagnostics({
        content: '[Alpha][missing-alpha]',
        path: 'alpha.md',
      }),
      computeMicrosoftReferenceDiagnostics({
        content: '[Beta][missing-beta]',
        path: 'beta.md',
      }),
    ])

    expect(alpha.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'missing-alpha'",
    ])
    expect(beta.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'missing-beta'",
    ])
  })

  it('isolates simultaneous workspaces using the same relative path and dirty buffers', async () => {
    const [workspaceA, workspaceB] = await Promise.all([
      computeMicrosoftReferenceDiagnostics({
        content: '[Workspace A][dirty-a]',
        path: 'shared/note.md',
      }),
      computeMicrosoftReferenceDiagnostics({
        content: '[Workspace B][dirty-b]',
        path: 'shared/note.md',
      }),
    ])

    expect(workspaceA.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'dirty-a'",
    ])
    expect(workspaceB.map((diagnostic) => diagnostic.message)).toEqual([
      "No link definition found: 'dirty-b'",
    ])
  })

  it('honors an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      computeMicrosoftReferenceDiagnostics(
        { content: '[Cancelled][missing]', path: 'cancelled.md' },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
