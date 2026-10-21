import type { DesktopCommandResults } from '@/generated/desktop/bindings'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type CompletionList,
  type Diagnostic,
} from 'vscode-languageserver-types'
import { z } from 'zod'

const position = z.object({
  line: z.number().int().nonnegative().max(4_294_967_295),
  character: z.number().int().nonnegative().max(4_294_967_295),
})
const range = z.object({ start: position, end: position })
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)
const item = z.object({
  label: z.string(),
  kind: z
    .enum(CompletionItemKind)
    .nullish()
    .transform((value) => value ?? undefined),
  detail: optionalText,
  documentation: z
    .object({ kind: z.literal(MarkupKind.Markdown), value: z.string() })
    .nullish()
    .transform((value) => value ?? undefined),
  sortText: optionalText,
  filterText: optionalText,
  insertText: optionalText,
  insertTextFormat: z
    .enum(InsertTextFormat)
    .nullish()
    .transform((value) => value ?? undefined),
  textEdit: z
    .object({ range, newText: z.string() })
    .nullish()
    .transform((value) => value ?? undefined),
}) satisfies z.ZodType<CompletionItem>
const completion = z.object({
  isIncomplete: z.boolean(),
  items: z.array(item),
}) satisfies z.ZodType<CompletionList>
const diagnostic = z.object({
  range,
  severity: z
    .enum(DiagnosticSeverity)
    .nullish()
    .transform((value) => value ?? undefined),
  source: optionalText,
  message: z.string(),
}) satisfies z.ZodType<Diagnostic>

// Rust reflects protocol extension integers as numbers. Validate the supported
// LSP values and normalize nullable fields before entering editor APIs.
export const parseLanguageCompletion = (
  value: DesktopCommandResults['language_completion'],
): CompletionList => completion.parse(value)

export const parseLanguageDiagnostics = (
  value: DesktopCommandResults['language_diagnostics'],
): Diagnostic[] => z.array(diagnostic).parse(value)
