import { describe, expect, it } from 'vitest'
import { allowedCommands } from '@electron/preload/allowlists.js'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'

describe('legacy Markdown completion boundary', () => {
  it('does not expose the full-document completion command to the renderer', () => {
    expect(allowedCommands.has('markdown_language_get_completions')).toBe(false)
    expect(markdownLanguageApi).not.toHaveProperty('getCompletions')
  })
})
