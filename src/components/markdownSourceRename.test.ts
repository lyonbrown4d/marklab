import type { editor, languages } from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { registerMarkdownRenameProvider } from '@/components/markdownSourceRename'
import {
  markdownLanguageApi,
  type MarkdownLanguageRenameResult,
} from '@/services/markdownLanguageApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: { renameReferences: vi.fn() },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
const plan: MarkdownLanguageRenameResult = {
  edits: [
    { path: 'Current.md', line: 1, startColumn: 3, endColumn: 8, newText: 'Renamed' },
    { path: 'Other.md', line: 2, startColumn: 3, endColumn: 8, newText: 'Renamed' },
  ],
  appliedEdits: 1,
  touchedFiles: ['Other.md'],
}
const fixture = () => {
  let provider!: languages.RenameProvider
  let version = 4
  let content = '# Title'
  let path = 'Current.md'
  const token = { isCancellationRequested: false }
  const model = {
    uri: 'file:///Current.md',
    isDisposed: () => false,
    getValue: () => content,
    getVersionId: () => version,
  }
  class Range {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber
      this.startColumn = startColumn
      this.endLineNumber = endLineNumber
      this.endColumn = endColumn
    }
  }
  registerMarkdownRenameProvider(
    {
      Range,
      languages: {
        registerRenameProvider: (_language: string, next: languages.RenameProvider) => {
          provider = next
          return { dispose: vi.fn() }
        },
      },
    } as unknown as typeof import('monaco-editor'),
    () => ({ activePath: path, files: [], fileContents: {} }),
  )
  return {
    rename: () =>
      provider.provideRenameEdits(
        model as unknown as editor.ITextModel,
        { lineNumber: 1, column: 4 } as never,
        'Renamed',
        token as never,
      ),
    edit: () => {
      version += 1
      content = '# Changed'
    },
    cancel: () => {
      token.isCancellationRequested = true
    },
    switchFile: () => {
      path = 'Other.md'
    },
  }
}
beforeEach(() => {
  vi.mocked(flushEditorChanges).mockReset().mockResolvedValue(undefined)
  vi.mocked(markdownLanguageApi.renameReferences).mockReset().mockResolvedValue(plan)
})

describe('Markdown source rename snapshot', () => {
  it('flushes before requesting the plan and binds source edits to the initial model version', async () => {
    const saved = deferred<void>()
    vi.mocked(flushEditorChanges).mockReturnValue(saved.promise)
    const pending = fixture().rename()
    expect(markdownLanguageApi.renameReferences).not.toHaveBeenCalled()
    saved.resolve(undefined)
    const result = await pending
    expect(markdownLanguageApi.renameReferences).toHaveBeenCalledWith({
      path: 'Current.md',
      content: '# Title',
      line: 1,
      column: 4,
      newName: 'Renamed',
    })
    expect(result).toMatchObject({
      edits: [
        {
          resource: 'file:///Current.md',
          versionId: 4,
          textEdit: {
            text: 'Renamed',
            range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 8 },
          },
        },
      ],
    })
  })

  it('rejects the old plan when the source model changes while native rename is pending', async () => {
    const request = deferred<MarkdownLanguageRenameResult>()
    vi.mocked(markdownLanguageApi.renameReferences).mockReturnValue(request.promise)
    const source = fixture()
    const pending = source.rename()
    await Promise.resolve()
    expect(markdownLanguageApi.renameReferences).toHaveBeenCalledOnce()
    source.edit()
    request.resolve(plan)
    expect(await pending).toMatchObject({ edits: [], rejectReason: expect.any(String) })
  })

  it('does not call native rename when flushing the current draft fails', async () => {
    vi.mocked(flushEditorChanges).mockRejectedValue(new Error('save conflict'))
    expect(await fixture().rename()).toMatchObject({ edits: [], rejectReason: expect.any(String) })
    expect(markdownLanguageApi.renameReferences).not.toHaveBeenCalled()
  })

  it.each(['edit', 'cancel'] as const)(
    'does not request a plan after %s during the draft flush',
    async (change) => {
      const saved = deferred<void>()
      vi.mocked(flushEditorChanges).mockReturnValue(saved.promise)
      const source = fixture()
      const pending = source.rename()
      source[change]()
      saved.resolve(undefined)
      expect(await pending).toMatchObject({ edits: [], rejectReason: expect.any(String) })
      expect(markdownLanguageApi.renameReferences).not.toHaveBeenCalled()
    },
  )

  it('rejects a plan after switching to another source file', async () => {
    const request = deferred<MarkdownLanguageRenameResult>()
    vi.mocked(markdownLanguageApi.renameReferences).mockReturnValue(request.promise)
    const source = fixture()
    const pending = source.rename()
    await Promise.resolve()
    source.switchFile()
    request.resolve(plan)
    expect(await pending).toMatchObject({ edits: [], rejectReason: expect.any(String) })
  })
})
