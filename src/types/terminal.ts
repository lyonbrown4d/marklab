import { z } from 'zod'

const terminalPathSchema = z.string().max(32_768)

export const terminalCreateRequestSchema = z
  .object({
    cols: z.number().int(),
    cwd: terminalPathSchema.optional(),
    rows: z.number().int(),
    shellPath: terminalPathSchema.nullable().optional(),
  })
  .strict()

export type TerminalCreateRequest = z.infer<typeof terminalCreateRequestSchema>
