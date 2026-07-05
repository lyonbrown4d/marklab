import { describe, expect, it, vi } from 'vitest'

import {
  applyWindowDocumentStatus,
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
})
