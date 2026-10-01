import { describe, expect, it, vi } from 'vitest'

import {
  LanguageIntelligenceService,
  type LanguageIntelligenceProvider,
} from '@electron/services/languageIntelligence/service.js'

const uri = 'marklab:///notes/today.md'

describe('LanguageIntelligenceService', () => {
  it('adapts the embedded Mermaid provider through the same completion protocol', async () => {
    const service = new LanguageIntelligenceService()
    service.openDocument(11, {
      uri: 'marklab-embedded:///notes/today.md/diagram-1.mmd',
      languageId: 'mermaid',
      version: 1,
      text: 'flo',
    })

    const result = await service.completion(11, {} as never, {
      uri: 'marklab-embedded:///notes/today.md/diagram-1.mmd',
      version: 1,
      position: { line: 0, character: 3 },
    })

    expect(result.items.map((item) => item.label)).toContain('flowchart diagram')
  })

  it('keeps incrementally updated documents isolated by renderer owner', async () => {
    const completion = vi.fn<LanguageIntelligenceProvider['completion']>(async ({ document }) => ({
      isIncomplete: false,
      items: [{ label: document.getText() }],
    }))
    const service = new LanguageIntelligenceService([{ languageIds: ['markdown'], completion }])
    const workspace = {} as never

    service.openDocument(11, {
      uri,
      languageId: 'markdown',
      path: 'notes/today.md',
      version: 1,
      text: 'Today',
    })
    service.openDocument(22, {
      uri,
      languageId: 'markdown',
      path: 'notes/today.md',
      version: 1,
      text: 'Other',
    })
    service.changeDocument(11, {
      uri,
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 5 },
          },
          text: ' plan',
        },
      ],
    })

    await expect(
      service.completion(11, workspace, {
        uri,
        version: 2,
        position: { line: 0, character: 10 },
      }),
    ).resolves.toMatchObject({ items: [{ label: 'Today plan' }] })
    await expect(
      service.completion(22, workspace, {
        uri,
        version: 1,
        position: { line: 0, character: 5 },
      }),
    ).resolves.toMatchObject({ items: [{ label: 'Other' }] })
  })

  it('rejects stale changes and completion requests for a different version', async () => {
    const service = new LanguageIntelligenceService([
      {
        languageIds: ['markdown'],
        completion: vi.fn(async () => ({ isIncomplete: false, items: [] })),
      },
    ])
    service.openDocument(11, {
      uri,
      languageId: 'markdown',
      path: null,
      version: 4,
      text: 'text',
    })

    expect(() =>
      service.changeDocument(11, {
        uri,
        version: 4,
        changes: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            text: 'x',
          },
        ],
      }),
    ).toThrow('newer')
    await expect(
      service.completion(11, {} as never, {
        uri,
        version: 3,
        position: { line: 0, character: 0 },
      }),
    ).rejects.toThrow('version')
  })

  it('rejects a change that skips the next document version', () => {
    const service = new LanguageIntelligenceService([
      {
        languageIds: ['markdown'],
        completion: vi.fn(async () => ({ isIncomplete: false, items: [] })),
      },
    ])
    service.openDocument(11, {
      uri,
      languageId: 'markdown',
      path: null,
      version: 4,
      text: 'text',
    })

    expect(() =>
      service.changeDocument(11, {
        uri,
        version: 6,
        changes: [
          {
            range: {
              start: { line: 0, character: 4 },
              end: { line: 0, character: 4 },
            },
            text: '!',
          },
        ],
      }),
    ).toThrow('next version')
  })

  it('removes all documents owned by a destroyed renderer', async () => {
    const service = new LanguageIntelligenceService([
      {
        languageIds: ['markdown'],
        completion: vi.fn(async () => ({ isIncomplete: false, items: [] })),
      },
    ])
    service.openDocument(11, {
      uri,
      languageId: 'markdown',
      path: null,
      version: 1,
      text: 'text',
    })

    service.closeClient(11)

    await expect(
      service.completion(11, {} as never, {
        uri,
        version: 1,
        position: { line: 0, character: 0 },
      }),
    ).rejects.toThrow('not open')
  })

  it('runs optional diagnostics against the current incremental document version', async () => {
    const diagnostics = vi.fn<NonNullable<LanguageIntelligenceProvider['diagnostics']>>(
      async ({ document }) => [
        {
          message: document.getText(),
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
    )
    const service = new LanguageIntelligenceService([
      {
        languageIds: ['mermaid'],
        completion: vi.fn(async () => ({ isIncomplete: false, items: [] })),
        diagnostics,
      },
    ])
    service.openDocument(11, {
      uri: 'marklab-embedded://code-block/1.mermaid',
      languageId: 'mermaid',
      version: 1,
      text: 'flo',
    })
    service.changeDocument(11, {
      uri: 'marklab-embedded://code-block/1.mermaid',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 3 },
          },
          text: 'w',
        },
      ],
    })

    await expect(
      service.diagnostics(11, {} as never, {
        uri: 'marklab-embedded://code-block/1.mermaid',
        version: 2,
      }),
    ).resolves.toMatchObject([{ message: 'flow' }])
  })
})
