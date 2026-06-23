import { filter, map, share } from 'rxjs'
import { fromRuntimeEvent } from '@/lib/runtimeObservable'
import {
  terminalExitEventSchema,
  terminalOutputEventSchema,
  type TerminalExitEvent,
  type TerminalOutputEvent,
} from '@/services/terminalApi'

const isTerminalOutputEvent = (event: TerminalOutputEvent | null): event is TerminalOutputEvent =>
  event !== null

const isTerminalExitEvent = (event: TerminalExitEvent | null): event is TerminalExitEvent =>
  event !== null

const parseTerminalOutputEvent = (payload: unknown): TerminalOutputEvent | null => {
  const parsed = terminalOutputEventSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

const parseTerminalExitEvent = (payload: unknown): TerminalExitEvent | null => {
  const parsed = terminalExitEventSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

export const terminalOutputEvents$ = fromRuntimeEvent<unknown>('terminal-output').pipe(
  map((event) => parseTerminalOutputEvent(event.payload)),
  filter(isTerminalOutputEvent),
  share(),
)

export const terminalExitEvents$ = fromRuntimeEvent<unknown>('terminal-exit').pipe(
  map((event) => parseTerminalExitEvent(event.payload)),
  filter(isTerminalExitEvent),
  share(),
)
