import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

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
  .strict() satisfies z.ZodType<LanguageDocumentOpenRequest>

export const languageDocumentIncrementalChangeSchema = z
  .object({
    range: rangeSchema,
    rangeLength: z.number().int().nonnegative().nullish(),
    text: z.string().max(LANGUAGE_DOCUMENT_MAX_CHANGE_TEXT_LENGTH),
  })
  .strict() satisfies z.ZodType<LanguageDocumentChangeRequest['changes'][number]>

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
  }) satisfies z.ZodType<LanguageDocumentChangeRequest>

export const languageDocumentCloseRequestSchema = z
  .object({ uri: z.string().trim().min(1).max(4096) })
  .strict() satisfies z.ZodType<LanguageDocumentCloseRequest>

export const languageCompletionRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    version: z.number().int().nonnegative(),
    position: positionSchema,
  })
  .strict() satisfies z.ZodType<LanguageCompletionRequest>

export const languageDiagnosticsRequestSchema = z
  .object({
    uri: z.string().trim().min(1).max(4096),
    version: z.number().int().nonnegative(),
  })
  .strict() satisfies z.ZodType<LanguageDiagnosticsRequest>

export type LanguageDocumentOpenRequest = DesktopCommandArgs['language_document_open']['request']

export type LanguageDocumentChangeRequest =
  DesktopCommandArgs['language_document_change']['request']

export type LanguageDocumentCloseRequest = DesktopCommandArgs['language_document_close']['request']

export type LanguageCompletionRequest = DesktopCommandArgs['language_completion']['request']

export type LanguageDiagnosticsRequest = DesktopCommandArgs['language_diagnostics']['request']

export type LanguageDocumentAck = DesktopCommandResults['language_document_open']
export type LanguageDocumentCloseAck = DesktopCommandResults['language_document_close']

export type LanguageIntelligenceApi = {
  openDocument: (request: LanguageDocumentOpenRequest) => Promise<LanguageDocumentAck>
  changeDocument: (request: LanguageDocumentChangeRequest) => Promise<LanguageDocumentAck>
  closeDocument: (request: LanguageDocumentCloseRequest) => Promise<LanguageDocumentCloseAck>
  completion: (
    request: LanguageCompletionRequest,
  ) => Promise<DesktopCommandResults['language_completion']>
  diagnostics: (
    request: LanguageDiagnosticsRequest,
  ) => Promise<DesktopCommandResults['language_diagnostics']>
}
