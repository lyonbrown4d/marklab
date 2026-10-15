import { z } from 'zod'

export const gitScopeSchema = z
  .object({
    expectedRoot: z.string().min(1).max(32_768).optional(),
  })
  .strict()

export const withGitScope = <Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) =>
  schema.extend(gitScopeSchema.shape).strict()
