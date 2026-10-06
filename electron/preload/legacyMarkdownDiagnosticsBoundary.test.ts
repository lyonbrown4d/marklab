import { describe, expect, it } from 'vitest'
import { allowedCommands } from '@electron/preload/allowlists'
import { fsApi } from '@/services/fsApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'

describe('legacy Markdown diagnostics boundary', () => {
  it('does not expose the full-document diagnostics command to the renderer', () => {
    expect(allowedCommands.has('markdown_language_get_diagnostics')).toBe(false)
    expect(markdownLanguageApi).not.toHaveProperty('getDiagnostics')
    expect(allowedCommands.has('fs_analyze_markdown_buffer')).toBe(false)
    expect(fsApi).not.toHaveProperty('analyzeMarkdownBuffer')
  })
})
