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

const markdownLanguageDefinitionSchema = z
  .object({
    path: z.string(),
    line: z.number(),
    column: z.number(),
    endColumn: z.number().optional(),
    headingSlug: z.string().nullable().optional(),
  })
  .nullable()

const markdownLanguageReferenceSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number(),
  endColumn: z.number(),
  text: z.string(),
  context: z.string(),
  targetAnchor: z.string().nullable().optional(),
  targetHeadingSlug: z.string().nullable().optional(),
})

const markdownLanguageTextEditSchema = z.object({
  path: z.string(),
  line: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
  newText: z.string(),
})

const markdownLanguageRenameResultSchema = z.object({
  edits: z.array(markdownLanguageTextEditSchema),
  appliedEdits: z.number(),
  touchedFiles: z.array(z.string()),
  rejectReason: z.string().nullable().optional(),
})

const markdownLanguageCodeActionSchema = z.discriminatedUnion('kind', [
  z.object({
    title: z.string(),
    kind: z.literal('create-file'),
    path: z.string(),
    isPreferred: z.boolean().optional(),
  }),
  z.object({
    title: z.string(),
    kind: z.literal('replace-text'),
    edit: markdownLanguageTextEditSchema,
    isPreferred: z.boolean().optional(),
  }),
])

const markdownLanguageHoverSchema = z
  .object({
    path: z.string(),
    line: z.number(),
    heading: z.string().nullable().optional(),
    markdown: z.string(),
  })
  .nullable()

export type MarkdownLanguageCompletionItem = z.infer<typeof markdownLanguageCompletionItemSchema>
export type MarkdownLanguageDefinition = z.infer<typeof markdownLanguageDefinitionSchema>
export type MarkdownLanguageReference = z.infer<typeof markdownLanguageReferenceSchema>
export type MarkdownLanguageTextEdit = z.infer<typeof markdownLanguageTextEditSchema>
export type MarkdownLanguageRenameResult = z.infer<typeof markdownLanguageRenameResultSchema>
export type MarkdownLanguageCodeAction = z.infer<typeof markdownLanguageCodeActionSchema>
export type MarkdownLanguageHover = z.infer<typeof markdownLanguageHoverSchema>

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

  async getDefinition({
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
    const result = await invoke<unknown>('markdown_language_get_definition', {
      path,
      content,
      line,
      column,
    })
    return markdownLanguageDefinitionSchema.parse(result)
  },

  async getReferences({
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
    const result = await invoke<unknown>('markdown_language_get_references', {
      path,
      content,
      line,
      column,
    })
    return z.array(markdownLanguageReferenceSchema).parse(result)
  },

  async renameReferences({
    path,
    content,
    line,
    column,
    newName,
  }: {
    path: string | null
    content: string
    line: number
    column: number
    newName: string
  }) {
    const result = await invoke<unknown>('markdown_language_rename_references', {
      path,
      content,
      line,
      column,
      newName,
    })
    return markdownLanguageRenameResultSchema.parse(result)
  },

  async getCodeActions({
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
    const result = await invoke<unknown>('markdown_language_get_code_actions', {
      path,
      content,
      line,
      column,
    })
    return z.array(markdownLanguageCodeActionSchema).parse(result)
  },

  async getHover({
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
    const result = await invoke<unknown>('markdown_language_get_hover', {
      path,
      content,
      line,
      column,
    })
    return markdownLanguageHoverSchema.parse(result)
  },
}
