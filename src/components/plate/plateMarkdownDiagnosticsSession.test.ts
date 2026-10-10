import type { Diagnostic } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'
import { createPlateMarkdownDiagnosticsSession } from '@/components/plate/plateMarkdownDiagnosticsSession'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const diagnostic = {
  message: 'Problem',
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
} satisfies Diagnostic

describe('Plate Markdown diagnostics session', () => {
  it('synchronizes incrementally and ignores diagnostics superseded by newer content', async () => {
    const first = deferred<Diagnostic[]>()
    const api = {
      openDocument: vi.fn().mockResolvedValue({ ok: true, version: 1 }),
      changeDocument: vi.fn().mockResolvedValue({ ok: true, version: 2 }),
      closeDocument: vi.fn().mockResolvedValue({ ok: true }),
      completion: vi.fn(),
      diagnostics: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce([diagnostic]),
    } satisfies LanguageIntelligenceApi
    const onDiagnostics = vi.fn()
    const session = createPlateMarkdownDiagnosticsSession({
      api,
      onDiagnostics,
      onError: vi.fn(),
      path: 'notes/current.md',
      uri: 'marklab-rich-editor://test',
    })

    const stale = session.analyze('first')
    const current = session.analyze('second')
    first.resolve([diagnostic])
    await Promise.all([stale, current])

    expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith('second', [diagnostic])
    expect(api.openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'notes/current.md', text: 'first', version: 1 }),
    )
    expect(api.changeDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        changes: [expect.objectContaining({ text: 'second' })],
      }),
    )

    await session.close()
    expect(api.closeDocument).toHaveBeenCalledWith({ uri: 'marklab-rich-editor://test' })
  })
})
