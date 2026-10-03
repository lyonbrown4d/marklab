import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importMarkdownImages } from '@/components/editor/assets/importMarkdownImages'
import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    importMarkdownAsset: vi.fn(),
    importMarkdownAssetBase64: vi.fn(),
  },
}))

vi.mock('@/store/useMarkdownAssetSyncStore', () => ({
  beginMarkdownAssetSyncTask: () => vi.fn(),
}))

describe('importMarkdownImages', () => {
  beforeEach(() => vi.resetAllMocks())

  it('imports a local path and inserts the workspace-relative Markdown target', async () => {
    vi.mocked(fsApi.importMarkdownAsset).mockResolvedValue({
      copied: true,
      markdown_target: 'Guide.assets/diagram.png',
      relative_path: 'docs/Guide.assets/diagram.png',
    })
    const insertImage = vi.fn(() => true)
    const identity = {}

    await expect(
      importMarkdownImages([{ kind: 'path', path: 'C:\\tmp\\diagram.png' }], {
        activePath: 'docs/Guide.md',
        getDocumentPath: () => 'docs/Guide.md',
        getEditorIdentity: () => identity,
        insertImage,
        markdown: '# Guide',
        strategy: 'copy-to-document-assets',
      }),
    ).resolves.toBe(true)

    expect(fsApi.importMarkdownAsset).toHaveBeenCalledWith({
      documentPath: 'docs/Guide.md',
      sourcePath: 'C:\\tmp\\diagram.png',
      strategy: 'copy-to-document-assets',
      title: 'Guide',
    })
    expect(insertImage).toHaveBeenCalledWith('Guide.assets/diagram.png', 'diagram')
  })

  it('does not mutate a replacement document after an asynchronous import resolves', async () => {
    let finishImport!: (value: Awaited<ReturnType<typeof fsApi.importMarkdownAsset>>) => void
    vi.mocked(fsApi.importMarkdownAsset).mockImplementation(
      () => new Promise((resolve) => (finishImport = resolve)),
    )
    const firstEditor = {}
    let editor: object | null = firstEditor
    let path = 'first.md'
    const insertImage = vi.fn(() => true)
    const promise = importMarkdownImages([{ kind: 'path', path: '/tmp/image.png' }], {
      activePath: path,
      getDocumentPath: () => path,
      getEditorIdentity: () => editor,
      insertImage,
      markdown: '# First',
      strategy: 'copy-to-document-assets',
    })

    path = 'second.md'
    editor = {}
    finishImport({
      copied: true,
      markdown_target: 'First.assets/image.png',
      relative_path: 'image.png',
    })

    await expect(promise).resolves.toBe(false)
    expect(insertImage).not.toHaveBeenCalled()
  })

  it('honors cancellation before inserting a completed import', async () => {
    const controller = new AbortController()
    vi.mocked(fsApi.importMarkdownAsset).mockResolvedValue({
      copied: true,
      markdown_target: 'Page.assets/image.png',
      relative_path: 'Page.assets/image.png',
    })
    controller.abort()
    const insertImage = vi.fn(() => true)

    await expect(
      importMarkdownImages([{ kind: 'path', path: '/tmp/image.png' }], {
        activePath: 'Page.md',
        getDocumentPath: () => 'Page.md',
        getEditorIdentity: () => ({}),
        insertImage,
        markdown: '# Page',
        signal: controller.signal,
        strategy: 'copy-to-document-assets',
      }),
    ).resolves.toBe(false)
    expect(fsApi.importMarkdownAsset).not.toHaveBeenCalled()
    expect(insertImage).not.toHaveBeenCalled()
  })

  it('links a workspace file-tree asset relative to the document without filesystem IPC', async () => {
    const identity = {}
    const insertImage = vi.fn(() => true)

    await expect(
      importMarkdownImages([{ kind: 'path', path: 'assets/diagrams/flow.png', name: 'flow.png' }], {
        activePath: 'docs/Guide.md',
        getDocumentPath: () => 'docs/Guide.md',
        getEditorIdentity: () => identity,
        insertImage,
        markdown: '# Guide',
        strategy: 'copy-to-document-assets',
      }),
    ).resolves.toBe(true)

    expect(fsApi.importMarkdownAsset).not.toHaveBeenCalled()
    expect(insertImage).toHaveBeenCalledWith('../assets/diagrams/flow.png', 'flow')
  })

  it('imports a browser clipboard blob through the typed base64 boundary', async () => {
    vi.mocked(fsApi.importMarkdownAssetBase64).mockResolvedValue({
      copied: true,
      markdown_target: 'Page.assets/paste.png',
      relative_path: 'Page.assets/paste.png',
    })
    const identity = {}
    const insertImage = vi.fn(() => true)

    await expect(
      importMarkdownImages(
        [{ kind: 'file', file: new File(['png'], 'paste.png', { type: 'image/png' }) }],
        {
          activePath: 'Page.md',
          getDocumentPath: () => 'Page.md',
          getEditorIdentity: () => identity,
          insertImage,
          markdown: '',
          strategy: 'copy-to-document-assets',
        },
      ),
    ).resolves.toBe(true)

    expect(fsApi.importMarkdownAssetBase64).toHaveBeenCalledWith(
      expect.objectContaining({ documentPath: 'Page.md', fileName: 'paste.png' }),
    )
    expect(insertImage).toHaveBeenCalledWith('Page.assets/paste.png', 'paste')
  })

  it('inserts a validated remote image without invoking filesystem IPC', async () => {
    const identity = {}
    const insertImage = vi.fn(() => true)

    await expect(
      importMarkdownImages([{ kind: 'url', url: 'https://cdn.example.com/hero.png' }], {
        activePath: 'Page.md',
        getDocumentPath: () => 'Page.md',
        getEditorIdentity: () => identity,
        insertImage,
        markdown: '',
        strategy: 'copy-to-document-assets',
      }),
    ).resolves.toBe(true)

    expect(fsApi.importMarkdownAsset).not.toHaveBeenCalled()
    expect(fsApi.importMarkdownAssetBase64).not.toHaveBeenCalled()
    expect(insertImage).toHaveBeenCalledWith('https://cdn.example.com/hero.png', 'hero')
  })
})
