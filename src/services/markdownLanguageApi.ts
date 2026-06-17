import { z } from 'zod'
import { invoke } from '@/runtime/ipc'
import { fsMarkdownDiagnosticSchema } from '@/services/fsApi'

const markdownLanguageCompletionItemSchema = z.object({
  label: z.string(),
  kind: z.enum(['file', 'heading', 'language']),
  insertText: z.string(),
  detail: z.string().optional(),
  replacementStartColumn: z.number(),
  lspKind: z.number(),
})

export type MarkdownLanguageCompletionItem = z.infer<typeof markdownLanguageCompletionItemSchema>

export const markdownLanguageApi = {
  async getCompletions({
    path,
    content,
    line,
    column,
  }: {
    path: string | null
    content: string
    line: number
    column: number
  }) {
    const result = await invoke<unknown>('markdown_language_get_completions', {
      path,
      content,
      line,
      column,
    })
    return z.array(markdownLanguageCompletionItemSchema).parse(result)
  },

  async getDiagnostics({ path, content }: { path: string; content: string }) {
    const result = await invoke<unknown>('markdown_language_get_diagnostics', { path, content })
    return z.array(fsMarkdownDiagnosticSchema).parse(result)
  },
}
