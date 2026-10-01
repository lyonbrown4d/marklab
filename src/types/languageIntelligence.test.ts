import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_DOCUMENT_MAX_CHANGE_BATCH_TEXT_LENGTH,
  languageDocumentChangeRequestSchema,
} from '@/types/languageIntelligence'

describe('language intelligence payload limits', () => {
  it('rejects a change batch whose combined inserted text exceeds the limit', () => {
    const half = Math.floor(LANGUAGE_DOCUMENT_MAX_CHANGE_BATCH_TEXT_LENGTH / 2) + 1
    const result = languageDocumentChangeRequestSchema.safeParse({
      uri: 'file:///workspace/note.md',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          text: 'a'.repeat(half),
        },
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          text: 'b'.repeat(half),
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
