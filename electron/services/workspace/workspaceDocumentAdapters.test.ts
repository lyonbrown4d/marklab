import { describe, expect, it } from 'vitest'

import { workspaceDocumentAdapterForPath } from '@electron/services/workspace/documentAdapters.js'

describe('workspace document adapters', () => {
  it('recognizes Excalidraw whiteboard documents', () => {
    expect(workspaceDocumentAdapterForPath('boards/idea.EXCALIDRAW')?.kind).toBe('excalidraw')
  })

  it('recognizes allowlisted source and delimited-data documents', () => {
    expect(workspaceDocumentAdapterForPath('src/main.TS')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('data/report.csv')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('data/report.tsv')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('payload.exe')).toBeNull()
  })
})
