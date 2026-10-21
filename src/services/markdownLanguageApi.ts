import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'
import { invoke } from '@/runtime/ipc'

const markdownLanguageDefinitionSchema = z
  .object({
    path: z.string(),
    line: z.number(),
    column: z.number(),
    endColumn: z.number().optional(),
    headingSlug: z.string().optional(),
  })
  .nullable() satisfies z.ZodType<MarkdownLanguageDefinition>

type MarkdownLanguageDocumentSymbolWire = MarkdownLanguageDocumentSymbol

const markdownLanguageDocumentSymbolSchema: z.ZodType<MarkdownLanguageDocumentSymbolWire> = z.lazy(
  () =>
    z.object({
      name: z.string(),
      level: z.number(),
      line: z.number(),
      column: z.number(),
      endColumn: z.number(),
      lspKind: z.number(),
      children: z.array(markdownLanguageDocumentSymbolSchema),
    }),
)

const markdownLanguageReferenceSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number(),
  endColumn: z.number(),
  text: z.string(),
  context: z.string(),
  targetAnchor: z.string().nullable(),
  targetHeadingSlug: z.string().nullable(),
}) satisfies z.ZodType<MarkdownLanguageReference>

const markdownLanguageTextEditSchema = z.object({
  path: z.string().nullable(),
  line: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
  newText: z.string(),
}) satisfies z.ZodType<MarkdownLanguageTextEdit>

const markdownLanguageRenameResultSchema = z.object({
  edits: z.array(markdownLanguageTextEditSchema.extend({ path: z.string() })),
  appliedEdits: z.number(),
  touchedFiles: z.array(z.string()),
  rejectReason: z.string().nullable(),
}) satisfies z.ZodType<MarkdownLanguageRenameResult>

const markdownLanguageCodeActionSchema = z.discriminatedUnion('kind', [
  z.object({
    title: z.string(),
    kind: z.literal('create-file'),
    path: z.string(),
    content: z.string().optional(),
    isPreferred: z.boolean(),
  }),
  z.object({
    title: z.string(),
    kind: z.literal('replace-text'),
    edit: markdownLanguageTextEditSchema,
    isPreferred: z.boolean(),
  }),
]) satisfies z.ZodType<MarkdownLanguageCodeAction>

const markdownLanguageHoverSchema = z
  .object({
    path: z.string(),
    line: z.number(),
    heading: z.string().nullable(),
    markdown: z.string(),
  })
  .nullable() satisfies z.ZodType<MarkdownLanguageHover>

export type MarkdownLanguageDefinition = DesktopCommandResults['markdown_language_get_definition']
export type MarkdownLanguageDocumentSymbol =
  DesktopCommandResults['markdown_language_get_document_symbols'][number]
export type MarkdownLanguageReference =
  DesktopCommandResults['markdown_language_get_references'][number]
export type MarkdownLanguageTextEdit = Extract<
  DesktopCommandResults['markdown_language_get_code_actions'][number],
  { kind: 'replace-text' }
>['edit']
export type MarkdownLanguageRenameResult =
  DesktopCommandResults['markdown_language_rename_references']
export type MarkdownLanguageCodeAction =
  DesktopCommandResults['markdown_language_get_code_actions'][number]
export type MarkdownLanguageHover = DesktopCommandResults['markdown_language_get_hover']

export const markdownLanguageApi = {
  async getDocumentSymbols({
    path,
    content,
  }: Pick<
    DesktopCommandArgs['markdown_language_get_document_symbols']['request'],
    'path' | 'content'
  >) {
    const result = await invoke('markdown_language_get_document_symbols', {
      path,
      content,
    })
    return z.array(markdownLanguageDocumentSymbolSchema).parse(result)
  },

  async getDefinition({
    path,
    content,
    line,
    column,
  }: DesktopCommandArgs['markdown_language_get_definition']['request']) {
    const result = await invoke('markdown_language_get_definition', {
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
  }: DesktopCommandArgs['markdown_language_get_definition']['request']) {
    const result = await invoke('markdown_language_get_references', {
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
  }: DesktopCommandArgs['markdown_language_rename_references']['request']) {
    const result = await invoke('markdown_language_rename_references', {
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
  }: DesktopCommandArgs['markdown_language_get_definition']['request']) {
    const result = await invoke('markdown_language_get_code_actions', {
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
  }: DesktopCommandArgs['markdown_language_get_definition']['request']) {
    const result = await invoke('markdown_language_get_hover', {
      path,
      content,
      line,
      column,
    })
    return markdownLanguageHoverSchema.parse(result)
  },
}
