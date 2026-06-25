import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMarkdownCodeActionProvider } from '@/components/markdownSourceCodeActions'
import { fsApi } from '@/services/fsApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    createFile: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: {
    getCodeActions: vi.fn(() => Promise.resolve([])),
  },
}))

type ProviderResult = {
  actions: Array<{
    command?: {
      arguments?: unknown[]
      id: string
      title: string
    }
  }>
  dispose: () => void
}

type CodeActionProvider = {
  provideCodeActions: (
    model: {
      getValue: () => string
      getVersionId: () => number
      uri: string
    },
    range: { startLineNumber: number; startColumn: number },
    context: unknown,
    token: { isCancellationRequested: boolean },
  ) => Promise<ProviderResult>
}

type CreateFileCommandHandler = (_accessor: unknown, path: string, content?: string) => void

class TestRange {
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

const createProviderFixture = () => {
  const fixture: {
    commandHandler?: CreateFileCommandHandler
    provider?: CodeActionProvider
  } = {}
  const editor = {
    addCommand: vi.fn((_weight: number, handler: CreateFileCommandHandler) => {
      fixture.commandHandler = handler
      return 'marklab.createFile'
    }),
  }
  const monaco = {
    Range: TestRange,
    languages: {
      registerCodeActionProvider: vi.fn((_language: string, nextProvider: CodeActionProvider) => {
        fixture.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    },
  }

  registerMarkdownCodeActionProvider({
    monaco: monaco as unknown as typeof import('monaco-editor'),
    editor: editor as never,
    getContext: () => ({ activePath: 'notes/current.md', files: [], fileContents: {} }),
    onOpenFileView: vi.fn(),
  })

  if (!fixture.provider || !fixture.commandHandler) throw new Error('Provider fixture failed')
  return {
    commandHandler: fixture.commandHandler,
    provider: fixture.provider,
  }
}

beforeEach(() => {
  vi.mocked(fsApi.createFile).mockClear()
  vi.mocked(markdownLanguageApi.getCodeActions).mockReset()
})

describe('registerMarkdownCodeActionProvider', () => {
  it('passes initial file content when executing a create-file quick fix', async () => {
    vi.mocked(markdownLanguageApi.getCodeActions).mockResolvedValueOnce([
      {
        kind: 'create-file',
        path: 'notes/missing.md',
        content: '# draft plan\n',
        title: 'Create missing Markdown file "notes/missing.md"',
        isPreferred: true,
      },
    ])
    const { commandHandler, provider } = createProviderFixture()

    const result = await provider.provideCodeActions(
      {
        getValue: () => 'See [Missing](missing.md#draft-plan)',
        getVersionId: () => 2,
        uri: 'inmemory://model.md',
      },
      { startLineNumber: 1, startColumn: 18 },
      {},
      { isCancellationRequested: false },
    )

    expect(result.actions[0]?.command?.arguments).toEqual(['notes/missing.md', '# draft plan\n'])

    commandHandler(null, 'notes/missing.md', '# draft plan\n')

    expect(fsApi.createFile).toHaveBeenCalledWith('notes/missing.md', '# draft plan\n')
  })
})
