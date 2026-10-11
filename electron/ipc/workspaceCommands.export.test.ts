import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { issueSavePathCapability } from '@electron/ipc/savePathCapabilities'
import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('workspace export IPC', () => {
  it('loads the authoritative editor buffer in main instead of accepting Markdown over IPC', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-export-ipc-'))
    temporaryRoots.push(root)
    const outputPath = path.join(root, 'guide.pdf')
    await issueSavePathCapability(7, outputPath)
    const handlers = new Map<string, Handler>()
    const exportMarkdown = vi.fn((payload: unknown, context: unknown) => {
      void payload
      void context
      return 'export-pdf-1'
    })
    const readFile = vi.fn(async () => '# backend buffer')
    registerWorkspaceCommandsIpc(
      { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
      {
        app: { addRecentDocument: vi.fn() },
        exportService: { exportMarkdown } as never,
        graphLayoutStore: {} as never,
        localHistoryService: {} as never,
        logger: { info: vi.fn() } as never,
        workspaceRegistry: {
          serviceForWebContents: vi.fn(() => ({
            readFile,
            readMarkdownExportAsset: vi.fn(),
            resolveCoordinatorPath: (value: string) => path.join(root, value),
            rootInfo: () => ({ kind: 'external', path: root }),
          })),
        } as never,
      },
    )

    await expect(
      handlers.get('export_markdown')?.(event(), {
        format: 'pdf',
        markdown: '# renderer content must be ignored',
        outputPath,
        sourceDocumentPath: 'docs/guide.md',
      }),
    ).resolves.toBe('export-pdf-1')

    expect(readFile).toHaveBeenCalledWith({ path: 'docs/guide.md' })
    expect(exportMarkdown).toHaveBeenCalledWith(
      {
        format: 'pdf',
        markdown: '# backend buffer',
        outputPath,
      },
      expect.objectContaining({
        ownerId: 7,
        resourceBasePath: path.join(root, 'docs'),
        workspaceRootPath: root,
      }),
    )
    const context = exportMarkdown.mock.calls[0]?.[1] as unknown as {
      releaseOutput?: () => Promise<void>
    }
    await context.releaseOutput?.()
  })

  it('reads each selected chapter in main and scopes image loading to its source file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-publication-ipc-'))
    temporaryRoots.push(root)
    const outputPath = path.join(root, 'book.docx')
    await issueSavePathCapability(7, outputPath)
    const handlers = new Map<string, Handler>()
    const exportWorkspacePublication = vi.fn((...args: [unknown, unknown, string, unknown]) => {
      void args
      return 'export-docx-1'
    })
    const readFile = vi.fn(async ({ path: filePath }: { path: string }) => `# ${filePath}`)
    const readMarkdownExportAsset = vi.fn(async () => Buffer.from('image'))
    registerWorkspaceCommandsIpc(
      { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
      {
        app: { addRecentDocument: vi.fn() },
        exportService: { exportWorkspacePublication } as never,
        graphLayoutStore: {} as never,
        localHistoryService: {} as never,
        logger: { info: vi.fn() } as never,
        workspaceRegistry: {
          serviceForWebContents: vi.fn(() => ({
            readFile,
            readMarkdownExportAsset,
          })),
        } as never,
      },
    )

    await expect(
      handlers.get('export_workspace_publication')?.(event(), {
        chapters: [
          { path: 'one.md', title: 'One' },
          { path: 'nested/two.md', title: 'Two' },
        ],
        options: {
          cover: true,
          format: 'docx',
          locale: 'en-US',
          margin: 'normal',
          orientation: 'portrait',
          pageBreaks: true,
          pageNumbers: true,
          pageSize: 'a4',
          tableOfContents: true,
          title: 'Book',
        },
        outputPath,
      }),
    ).resolves.toBe('export-docx-1')

    expect(readFile).toHaveBeenNthCalledWith(1, { path: 'one.md' })
    expect(readFile).toHaveBeenNthCalledWith(2, { path: 'nested/two.md' })
    const chapters = exportWorkspacePublication.mock.calls[0]?.[0] as
      Array<{ readImage: (url: string) => Promise<Buffer | null> }> | undefined
    await chapters?.[1]?.readImage('image.png')
    expect(readMarkdownExportAsset).toHaveBeenCalledWith(
      'nested/two.md',
      'image.png',
      expect.any(Number),
    )
    const context = exportWorkspacePublication.mock.calls[0]?.[3] as
      { releaseOutput?: () => Promise<void> } | undefined
    await context?.releaseOutput?.()
  })
})

type Handler = (event: { sender: { id: number } }, payload: unknown) => unknown
const event = () => ({ sender: { id: 7 } })
