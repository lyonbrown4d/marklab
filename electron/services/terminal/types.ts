export type TerminalSessionInfo = {
  id: string
  shell: string
  cwd: string
}

export type TerminalOutputEvent = {
  id: string
  data: string
}

export type TerminalExitEvent = {
  id: string
  exit_code?: number | null
  signal?: string | null
}
