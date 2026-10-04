import { invoke } from '@/runtime/ipc'
import type { TerminalCreateRequest } from '@/types/terminal'
import { z } from 'zod'

export const terminalSessionSchema = z.object({
  id: z.string(),
  shell: z.string(),
  cwd: z.string(),
})

export const terminalOutputEventSchema = z.object({
  id: z.string(),
  data: z.string(),
})

export const terminalExitEventSchema = z.object({
  id: z.string(),
  exit_code: z.number().nullable().optional(),
  signal: z.string().nullable().optional(),
})

export type TerminalSessionInfo = z.infer<typeof terminalSessionSchema>
export type TerminalOutputEvent = z.infer<typeof terminalOutputEventSchema>
export type TerminalExitEvent = z.infer<typeof terminalExitEventSchema>

export const terminalApi = {
  async create(
    rows: TerminalCreateRequest['rows'],
    cols: TerminalCreateRequest['cols'],
    shellPath?: TerminalCreateRequest['shellPath'],
  ) {
    const request: TerminalCreateRequest = { rows, cols, shellPath }
    const result = await invoke<unknown>('terminal_create', request)
    return terminalSessionSchema.parse(result)
  },
  write(id: string, data: string) {
    return invoke<void>('terminal_write', { id, data })
  },
  resize(id: string, rows: number, cols: number) {
    return invoke<void>('terminal_resize', { id, rows, cols })
  },
  close(id: string) {
    return invoke<void>('terminal_close', { id })
  },
}
