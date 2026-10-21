import type { DesktopCommandArgs } from '@/generated/desktop/bindings'
import { z } from 'zod'

const terminalPathSchema = z.string().max(32_768)

export const terminalCreateRequestSchema = z
  .object({
    cols: z.number().int(),
    cwd: terminalPathSchema.nullish(),
    rows: z.number().int(),
    shellPath: terminalPathSchema.nullable().optional(),
  })
  .strict() satisfies z.ZodType<TerminalCreateRequest>

export type TerminalCreateRequest = DesktopCommandArgs['terminal_create']['request']
