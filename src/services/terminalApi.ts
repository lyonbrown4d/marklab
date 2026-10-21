import type { DesktopCommandResults, DesktopEventPayloads } from '@/generated/desktop/bindings'
import { invoke } from '@/runtime/ipc'
import type { TerminalCreateRequest } from '@/types/terminal'
import { z } from 'zod'

export const terminalSessionSchema = z.object({
  id: z.string(),
  shell: z.string(),
  cwd: z.string(),
}) satisfies z.ZodType<TerminalSessionInfo>

export const terminalOutputEventSchema = z.object({
  id: z.string(),
  data: z.string(),
}) satisfies z.ZodType<TerminalOutputEvent>

export const terminalExitEventSchema = z.object({
  id: z.string(),
  exit_code: z.number().nullable().default(null),
  signal: z.string().nullable().default(null),
}) satisfies z.ZodType<TerminalExitEvent>

export type TerminalSessionInfo = DesktopCommandResults['terminal_create']
export type TerminalOutputEvent = DesktopEventPayloads['terminal-output']
export type TerminalExitEvent = DesktopEventPayloads['terminal-exit']

export const terminalApi = {
  async create(
    rows: TerminalCreateRequest['rows'],
    cols: TerminalCreateRequest['cols'],
    shellPath?: TerminalCreateRequest['shellPath'],
  ) {
    const request: TerminalCreateRequest = { rows, cols, shellPath }
    const result = await invoke('terminal_create', request)
    return terminalSessionSchema.parse(result)
  },
  write(id: string, data: string) {
    return invoke('terminal_write', { id, data })
  },
  resize(id: string, rows: number, cols: number) {
    return invoke('terminal_resize', { id, rows, cols })
  },
  close(id: string) {
    return invoke('terminal_close', { id })
  },
}
