import { describe, expect, it, vi } from 'vitest'

import {
  applyAppRecentDocument,
  applyWindowDocumentStatus,
  createNativeRecentDocumentState,
  recentDocumentPathForRoot,
  representedFilenameForRoot,
} from '@electron/services/nativeWindowDocument.js'
import type { FsRootInfo } from '@electron/services/workspace/types.js'

const root = (kind: FsRootInfo['kind'], path: string): FsRootInfo => ({ kind, path })

describe('native window document status', () => {
  it('uses external workspace and single-file paths as represented filenames', () => {
    expect(representedFilenameForRoot(root('external', '/workspace'))).toBe('/workspace')
    expect(representedFilenameForRoot(root('single', '/workspace/note.md'))).toBe(
      '/workspace/note.md',
    )
  })

  it('hides the represented filename for the internal workspace', () => {
    expect(representedFilenameForRoot(root('internal', '/user-data/workspace'))).toBe('')
  })

  it('uses external workspace and single-file paths for native recent documents', () => {
    expect(recentDocumentPathForRoot(root('external', '/workspace'))).toBe('/workspace')
    expect(recentDocumentPathForRoot(root('single', '/workspace/note.md'))).toBe(
      '/workspace/note.md',
    )
    expect(recentDocumentPathForRoot(root('internal', '/user-data/workspace'))).toBeNull()
  })

  it('applies represented filename and edited state to native windows', () => {
    const window = {
      isDestroyed: () => false,
      setDocumentEdited: vi.fn(),
      setRepresentedFilename: vi.fn(),
    }

    applyWindowDocumentStatus(window, root('external', '/workspace'), true)

    expect(window.setRepresentedFilename).toHaveBeenCalledWith('/workspace')
    expect(window.setDocumentEdited).toHaveBeenCalledWith(true)
  })

  it('does not touch destroyed windows', () => {
    const window = {
      isDestroyed: () => true,
      setDocumentEdited: vi.fn(),
      setRepresentedFilename: vi.fn(),
    }

    applyWindowDocumentStatus(window, root('single', '/workspace/note.md'), true)

    expect(window.setRepresentedFilename).not.toHaveBeenCalled()
    expect(window.setDocumentEdited).not.toHaveBeenCalled()
  })

  it('adds supported workspace roots to native recent documents once', () => {
    const state = createNativeRecentDocumentState()
    const app = {
      addRecentDocument: vi.fn(),
    }

    applyAppRecentDocument(app, root('external', '/workspace'), state, 'darwin')
    applyAppRecentDocument(app, root('external', '/workspace'), state, 'darwin')

    expect(app.addRecentDocument).toHaveBeenCalledTimes(1)
    expect(app.addRecentDocument).toHaveBeenCalledWith('/workspace')
  })

  it('does not add internal workspaces or unsupported platforms to native recent documents', () => {
    const state = createNativeRecentDocumentState()
    const app = {
      addRecentDocument: vi.fn(),
    }

    applyAppRecentDocument(app, root('internal', '/user-data/workspace'), state, 'darwin')
    applyAppRecentDocument(app, root('single', '/workspace/note.md'), state, 'linux')

    expect(app.addRecentDocument).not.toHaveBeenCalled()
  })
})
