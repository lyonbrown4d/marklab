import { describe, expect, it } from 'vitest'

import { workspaceDocumentAdapterForPath } from '@electron/services/workspace/documentAdapters.js'

describe('workspace document adapters', () => {
  it('recognizes Excalidraw whiteboard documents', () => {
    expect(workspaceDocumentAdapterForPath('boards/idea.EXCALIDRAW')?.kind).toBe('excalidraw')
  })
})
