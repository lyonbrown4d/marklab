import { describe, expect, it } from 'vitest'
import { sourceLanguageForPath } from '@/logic/sourceLanguages'

describe('sourceLanguageForPath', () => {
  it('maps common source and delimited-data extensions to readable labels', () => {
    expect(sourceLanguageForPath('src/example.TSX')).toEqual({ id: 'typescript', label: 'TSX' })
    expect(sourceLanguageForPath('scripts/report.py')).toEqual({ id: 'python', label: 'Python' })
    expect(sourceLanguageForPath('data/report.csv')).toEqual({ id: 'plaintext', label: 'CSV' })
    expect(sourceLanguageForPath('data/report.tsv')).toEqual({ id: 'plaintext', label: 'TSV' })
  })

  it('falls back to a plain-text label for unknown extensions', () => {
    expect(sourceLanguageForPath('notes/example.unknown')).toEqual({
      id: 'plaintext',
      label: 'Plain text',
    })
  })
})
