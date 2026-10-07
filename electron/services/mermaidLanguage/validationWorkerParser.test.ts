import { describe, expect, it } from 'vitest'

import { validateWithOfficialMermaidParser } from '@electron/services/mermaidLanguage/validationWorkerParser'

const OFFICIAL_PARSER_COLD_START_TIMEOUT_MS = 60_000

describe('validateWithOfficialMermaidParser', () => {
  it(
    'accepts valid syntax with the official Mermaid parser',
    async () => {
      await expect(validateWithOfficialMermaidParser('flowchart LR\n  A --> B')).resolves.toEqual(
        [],
      )
    },
    OFFICIAL_PARSER_COLD_START_TIMEOUT_MS,
  )

  it('rejects invalid diagram body syntax with parser location data', async () => {
    await expect(validateWithOfficialMermaidParser('flowchart LR\n  A -->')).rejects.toMatchObject({
      message: expect.stringContaining('Parse error'),
    })
  })
})
