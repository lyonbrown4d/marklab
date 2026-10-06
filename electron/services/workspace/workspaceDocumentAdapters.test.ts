import { describe, expect, it } from 'vitest'

import { workspaceDocumentAdapterForPath } from '@electron/services/workspace/documentAdapters'

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

  it('recognizes common schema, build, and configuration source extensions', () => {
    for (const path of [
      'schema/api.gql',
      'schema/api.graphql',
      'android/build.gradle',
      'config/gradle.properties',
      'schema/events.proto',
    ]) {
      expect(workspaceDocumentAdapterForPath(path)?.kind).toBe('source')
    }
  })

  it('recognizes visible extensionless source filenames without allowing arbitrary dotfiles', () => {
    expect(workspaceDocumentAdapterForPath('services/api/Dockerfile')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('Makefile')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('tools/Justfile')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('.env')).toBeNull()
  })

  it('matches the renderer allowlist for supported source dotfiles', () => {
    expect(workspaceDocumentAdapterForPath('.editorconfig')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('.gitignore')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('.npmrc')?.kind).toBe('source')
    expect(workspaceDocumentAdapterForPath('.env')).toBeNull()
  })
})
