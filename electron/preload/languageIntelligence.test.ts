import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { createLanguageIntelligencePreloadSurface } from '@electron/preload/languageIntelligence.js'

describe('language intelligence preload surface', () => {
  it('uses a dedicated diagnostics channel without sending document content', async () => {
    const invoke = vi
      .fn<(channel: string, payload: unknown) => Promise<unknown>>()
      .mockResolvedValue([])
    const surface = createLanguageIntelligencePreloadSurface({ invoke } as never)
    const request = { uri: 'marklab-embedded://code-block/1.mermaid', version: 2 }

    await surface.diagnostics(request)

    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.languageDiagnostics, request)
    expect(invoke.mock.calls[0]?.[1]).not.toHaveProperty('content')
  })

  it('uses dedicated named channels and sends no document content for completion', async () => {
    const invoke = vi
      .fn<(channel: string, payload: unknown) => Promise<unknown>>()
      .mockResolvedValue({ isIncomplete: false, items: [] })
    const surface = createLanguageIntelligencePreloadSurface({ invoke } as never)
    const request = {
      uri: 'marklab:///notes/today.md',
      version: 2,
      position: { line: 0, character: 5 },
    }

    await surface.completion(request)

    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.languageCompletion, request)
    expect(invoke.mock.calls[0]?.[1]).not.toHaveProperty('content')
  })

  it('exposes explicit document lifecycle methods', async () => {
    const invoke = vi
      .fn<(channel: string, payload: unknown) => Promise<unknown>>()
      .mockResolvedValue({ ok: true, version: 1 })
    const surface = createLanguageIntelligencePreloadSurface({ invoke } as never)

    await surface.openDocument({
      uri: 'marklab:///notes/today.md',
      languageId: 'markdown',
      path: 'notes/today.md',
      version: 1,
      text: 'Today',
    })
    await surface.changeDocument({
      uri: 'marklab:///notes/today.md',
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
    await surface.closeDocument({ uri: 'marklab:///notes/today.md' })

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      nativeIpcChannels.languageDocumentOpen,
      nativeIpcChannels.languageDocumentChange,
      nativeIpcChannels.languageDocumentClose,
    ])
  })
})
