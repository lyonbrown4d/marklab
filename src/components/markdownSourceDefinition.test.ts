import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMarkdownDefinitionClick } from '@/components/markdownSourceDefinition'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'
import {
  clearPendingSourcePositionNavigation,
  sourcePositionNavigationStore,
} from '@/utils/editorNavigation'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: { getDefinition: vi.fn() },
}))

const getDefinition = vi.mocked(markdownLanguageApi.getDefinition)

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const createFixture = () => {
  let mouseHandler: ((event: never) => void) | undefined
  let version = 1
  const model = {
    getValue: () => '# Current',
    getVersionId: () => version,
    isDisposed: () => false,
  }
  const editor = {
    getModel: () => model,
    onMouseDown: vi.fn((handler: (event: never) => void) => {
      mouseHandler = handler
      return { dispose: vi.fn() }
    }),
  }
  let context: MarkdownSourceCompletionContext = {
    activePath: 'notes/current.md',
    files: [],
    fileContents: {},
  }
  let workspaceKey = 'external:C:/notes'
  const onOpenFileView = vi.fn()
  registerMarkdownDefinitionClick({
    editor: editor as never,
    getContext: () => context,
    getWorkspaceKey: () => workspaceKey,
    onOpenFileView,
  } as never)
  const click = () =>
    mouseHandler?.({
      event: { browserEvent: { ctrlKey: true, metaKey: false }, preventDefault: vi.fn() },
      target: { position: { lineNumber: 1, column: 2 } },
    } as never)
  return {
    click,
    model,
    onOpenFileView,
    setContext: (next: MarkdownSourceCompletionContext) => {
      context = next
    },
    setVersion: (next: number) => {
      version = next
    },
    setWorkspaceKey: (next: string) => {
      workspaceKey = next
    },
  }
}

describe('registerMarkdownDefinitionClick', () => {
  beforeEach(() => {
    getDefinition.mockReset()
    clearPendingSourcePositionNavigation()
  })

  it('queues a current cross-file definition for the matching workspace', async () => {
    getDefinition.mockResolvedValue({ path: 'notes/target.md', line: 4, column: 2 })
    const fixture = createFixture()

    fixture.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(fixture.onOpenFileView).toHaveBeenCalledWith('notes/target.md', 'source')
    expect(
      sourcePositionNavigationStore.getState().requests['external:C:/notes:notes/target.md'],
    ).toEqual({
      path: 'notes/target.md',
      line: 4,
      column: 2,
      workspaceKey: 'external:C:/notes',
    })
  })

  it('ignores a definition response after the active document changes', async () => {
    const request = deferred<Awaited<ReturnType<typeof markdownLanguageApi.getDefinition>>>()
    getDefinition.mockReturnValue(request.promise)
    const fixture = createFixture()

    fixture.click()
    fixture.setContext({ activePath: 'notes/other.md', files: [], fileContents: {} })
    request.resolve({ path: 'notes/target.md', line: 4, column: 2 })
    await request.promise
    await Promise.resolve()

    expect(fixture.onOpenFileView).not.toHaveBeenCalled()
  })

  it('ignores a definition response after its workspace changes', async () => {
    const request = deferred<Awaited<ReturnType<typeof markdownLanguageApi.getDefinition>>>()
    getDefinition.mockReturnValue(request.promise)
    const fixture = createFixture()

    fixture.click()
    fixture.setWorkspaceKey('external:D:/other')
    request.resolve({ path: 'notes/target.md', line: 4, column: 2 })
    await request.promise
    await Promise.resolve()

    expect(fixture.onOpenFileView).not.toHaveBeenCalled()
  })

  it('ignores a definition response after the source model changes', async () => {
    const request = deferred<Awaited<ReturnType<typeof markdownLanguageApi.getDefinition>>>()
    getDefinition.mockReturnValue(request.promise)
    const fixture = createFixture()

    fixture.click()
    fixture.setVersion(2)
    request.resolve({ path: 'notes/target.md', line: 4, column: 2 })
    await request.promise
    await Promise.resolve()

    expect(fixture.onOpenFileView).not.toHaveBeenCalled()
  })
})
