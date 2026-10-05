import { describe, expect, it } from 'vitest'
import { sourceLanguageForPath } from '@/logic/sourceLanguages'

describe('sourceLanguageForPath', () => {
  it('maps common source and delimited-data extensions to readable labels', () => {
    expect(sourceLanguageForPath('src/example.TSX')).toEqual({ id: 'typescript', label: 'TSX' })
    expect(sourceLanguageForPath('scripts/report.py')).toEqual({ id: 'python', label: 'Python' })
    expect(sourceLanguageForPath('data/report.csv')).toEqual({ id: 'plaintext', label: 'CSV' })
    expect(sourceLanguageForPath('data/report.tsv')).toEqual({ id: 'plaintext', label: 'TSV' })
    expect(sourceLanguageForPath('schema/api.graphql')).toEqual({
      id: 'graphql',
      label: 'GraphQL',
    })
    expect(sourceLanguageForPath('schema/events.proto')).toEqual({
      id: 'protobuf',
      label: 'Protocol Buffers',
    })
    expect(sourceLanguageForPath('config/application.properties')).toEqual({
      id: 'properties',
      label: 'Properties',
    })
    expect(sourceLanguageForPath('android/build.gradle')).toEqual({
      id: 'gradle',
      label: 'Gradle',
    })
  })

  it('recognizes common extensionless build and configuration files', () => {
    expect(sourceLanguageForPath('services/api/Dockerfile')).toEqual({
      id: 'dockerfile',
      label: 'Dockerfile',
    })
    expect(sourceLanguageForPath('Makefile')).toEqual({ id: 'makefile', label: 'Makefile' })
    expect(sourceLanguageForPath('Justfile')).toEqual({ id: 'makefile', label: 'Justfile' })
    expect(sourceLanguageForPath('.editorconfig')).toEqual({
      id: 'ini',
      label: 'EditorConfig',
    })
    expect(sourceLanguageForPath('.gitignore')).toEqual({
      id: 'plaintext',
      label: 'Git ignore',
    })
    expect(sourceLanguageForPath('.npmrc')).toEqual({
      id: 'properties',
      label: 'npm config',
    })
  })

  it('falls back to a plain-text label for unknown extensions', () => {
    expect(sourceLanguageForPath('notes/example.unknown')).toEqual({
      id: 'plaintext',
      label: 'Plain text',
    })
  })
})
