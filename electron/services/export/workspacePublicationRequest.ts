import { z } from 'zod'
import type { WorkspacePublicationRequest } from '@/types/workspacePublication'

const publicationOptionsSchema = z
  .object({
    cover: z.boolean(),
    format: z.enum(['pdf', 'docx']),
    locale: z.enum(['en-US', 'zh-CN']),
    margin: z.enum(['normal', 'narrow', 'wide']),
    orientation: z.enum(['portrait', 'landscape']),
    pageBreaks: z.boolean(),
    pageNumbers: z.boolean(),
    pageSize: z.enum(['a4', 'a5', 'letter']),
    tableOfContents: z.boolean(),
    title: z.string().trim().min(1).max(200),
  })
  .strict()

const workspacePublicationRequestSchema = z
  .object({
    chapters: z
      .array(
        z
          .object({
            path: z.string().trim().min(1).max(2_048),
            title: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
    options: publicationOptionsSchema,
    outputPath: z.string(),
  })
  .strict()

export const parseWorkspacePublicationRequest = (value: unknown): WorkspacePublicationRequest => {
  const request = workspacePublicationRequestSchema.parse(value)
  const paths = request.chapters.map((chapter) => chapter.path)
  if (new Set(paths).size !== paths.length) {
    throw new Error('Workspace publication chapter paths must be unique')
  }
  return request
}
