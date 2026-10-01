import { z } from 'zod'
import type { CompletionList, Diagnostic, Position, Range } from 'vscode-languageserver-types'

export const LANGUAGE_DOCUMENT_MAX_TEXT_LENGTH = 16 * 1024 * 1024
export const LANGUAGE_DOCUMENT_MAX_CHANGE_TEXT_LENGTH = 4 * 1024 * 1024
export const LANGUAGE_DOCUMENT_MAX_CHANGE_BATCH_TEXT_LENGTH = 8 * 1024 * 1024
export const LANGUAGE_DOCUMENT_MAX_CHANGES = 100

const positionSchema = z
  .object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  })
  .strict()

const rangeSchema = z
  .object({
    start: positionSchema,
    end: positionSchema,
  })
  .strict()

export const languageDocumentOpenRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    languageId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_-]+$/i),
    path: z.string().max(32_768).nullable().optional(),
    version: z.number().int().nonnegative(),
    text: z.string().max(LANGUAGE_DOCUMENT_MAX_TEXT_LENGTH),
  })
  .strict()

export const languageDocumentIncrementalChangeSchema = z
  .object({
    range: rangeSchema,
    rangeLength: z.number().int().nonnegative().optional(),
    text: z.string().max(LANGUAGE_DOCUMENT_MAX_CHANGE_TEXT_LENGTH),
  })
  .strict()

export const languageDocumentChangeRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    version: z.number().int().nonnegative(),
    changes: z
      .array(languageDocumentIncrementalChangeSchema)
      .min(1)
      .max(LANGUAGE_DOCUMENT_MAX_CHANGES),
  })
  .strict()
  .superRefine((request, context) => {
    const totalTextLength = request.changes.reduce((total, change) => total + change.text.length, 0)
    if (totalTextLength <= LANGUAGE_DOCUMENT_MAX_CHANGE_BATCH_TEXT_LENGTH) return
    context.addIssue({
      code: 'custom',
      message: 'Document change batch text exceeds the maximum length',
      path: ['changes'],
    })
  })

export const languageDocumentCloseRequestSchema = z
  .object({ uri: z.string().trim().min(1).max(4096) })
  .strict()

export const languageCompletionRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    version: z.number().int().nonnegative(),
    position: positionSchema,
  })
  .strict()

export const languageDiagnosticsRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    version: z.number().int().nonnegative(),
  })
  .strict()

export type LanguageDocumentOpenRequest = z.infer<typeof languageDocumentOpenRequestSchema>
export type LanguageDocumentIncrementalChange = z.infer<
  typeof languageDocumentIncrementalChangeSchema
>
export type LanguageDocumentChangeRequest = z.infer<typeof languageDocumentChangeRequestSchema>
export type LanguageDocumentCloseRequest = z.infer<typeof languageDocumentCloseRequestSchema>
export type LanguageCompletionRequest = z.infer<typeof languageCompletionRequestSchema>
export type LanguageDiagnosticsRequest = z.infer<typeof languageDiagnosticsRequestSchema>

export type LanguageDocumentAck = { ok: true; version: number }
export type LanguageDocumentCloseAck = { ok: true }

export type LanguageIntelligenceApi = {
  openDocument: (request: LanguageDocumentOpenRequest) => Promise<LanguageDocumentAck>
  changeDocument: (request: LanguageDocumentChangeRequest) => Promise<LanguageDocumentAck>
  closeDocument: (request: LanguageDocumentCloseRequest) => Promise<LanguageDocumentCloseAck>
  completion: (request: LanguageCompletionRequest) => Promise<CompletionList>
  diagnostics: (request: LanguageDiagnosticsRequest) => Promise<Diagnostic[]>
}

export type LanguagePosition = Position
export type LanguageRange = Range
