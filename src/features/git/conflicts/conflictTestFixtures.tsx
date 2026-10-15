import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import enUS from '@/i18n/locales/en-US.json'
import {
  cancelGitConflictClose,
  discardGitConflictDraft,
} from '@/features/git/conflicts/conflictDraftStore'

const conflictApi = vi.hoisted(() => ({ getConflict: vi.fn(), saveConflict: vi.fn() }))
const configure = vi.hoisted(() => vi.fn())
const facade = vi.hoisted(() => vi.fn())
const monacoState = vi.hoisted(() => ({
  executeEdits: vi.fn(),
  pushUndoStop: vi.fn(),
  originalTrigger: vi.fn(),
  modifiedTrigger: vi.fn(),
  lastOptions: {} as Record<string, unknown>,
}))
vi.mock('@/services/gitApi', () => ({ gitApiForWorkspace: facade }))
vi.mock('@/lib/monaco', () => ({ configureMonaco: configure }))
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: translate }) }))
vi.mock('@monaco-editor/react', async () => {
  const { useEffect, useRef, useState } = await import('react')
  type Position = { lineNumber: number; column: number }
  type Edit = {
    range: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
    }
    text: string
  }
  type Props = {
    original: string
    modified: string
    onMount: (diff: unknown) => void
    options: Record<string, unknown>
    language: string
  }
  const DiffEditor = ({ original, modified, onMount, options, language }: Props) => {
    const input = useRef<HTMLTextAreaElement | null>(null)
    const comparison = useRef<HTMLPreElement | null>(null)
    const comparisonFocusListeners = useRef(new Set<() => void>())
    const [value, setValue] = useState(modified)
    const model = useRef({
      value: modified,
      listeners: new Set<() => void>(),
      undo: [] as string[],
      focusListeners: new Set<() => void>(),
    })
    monacoState.lastOptions = options
    const notify = (next: string) => {
      model.current.value = next
      setValue(next)
      model.current.listeners.forEach((listener) => listener())
    }
    const offset = (position: Position) =>
      model.current.value
        .split('\n')
        .slice(0, position.lineNumber - 1)
        .reduce((sum, line) => sum + line.length + 1, 0) +
      position.column -
      1
    useEffect(() => {
      const target = {
        getModel: () => ({
          getValueLength: () => model.current.value.length,
          getPositionAt: (index: number) => {
            const lines = model.current.value.slice(0, index).split('\n')
            return { lineNumber: lines.length, column: lines.at(-1)!.length + 1 }
          },
        }),
        getValue: () => model.current.value,
        onDidChangeModelContent: (listener: () => void) => {
          model.current.listeners.add(listener)
          return { dispose: () => model.current.listeners.delete(listener) }
        },
        onDidFocusEditorText: (listener: () => void) => {
          model.current.focusListeners.add(listener)
          return { dispose: () => model.current.focusListeners.delete(listener) }
        },
        trigger: (source: string, command: string, payload: unknown) => {
          monacoState.modifiedTrigger(source, command, payload)
          if (command === 'undo') {
            const previous = model.current.undo.pop()
            if (previous !== undefined) notify(previous)
          }
        },
        pushUndoStop: () => monacoState.pushUndoStop(),
        executeEdits: (source: string, edits: Edit[]) => {
          monacoState.executeEdits(source, edits)
          model.current.undo.push(model.current.value)
          for (const edit of edits)
            notify(
              model.current.value.slice(
                0,
                offset({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn }),
              ) +
                edit.text +
                model.current.value.slice(
                  offset({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn }),
                ),
            )
        },
        focus: () => input.current?.focus(),
        revealLineInCenter: vi.fn(),
      }
      const source = {
        onDidFocusEditorText: (listener: () => void) => {
          comparisonFocusListeners.current.add(listener)
          return { dispose: () => comparisonFocusListeners.current.delete(listener) }
        },
        trigger: monacoState.originalTrigger,
        focus: () => comparison.current?.focus(),
      }
      onMount({ getOriginalEditor: () => source, getModifiedEditor: () => target })
      // The real Monaco mounts once and retains its model/undo history across props.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useEffect(() => {
      model.current.value = modified
      setValue(modified)
    }, [modified])
    return (
      <div data-testid="conflict-monaco" data-language={language}>
        <pre
          ref={comparison}
          tabIndex={0}
          onFocus={() => comparisonFocusListeners.current.forEach((listener) => listener())}
          aria-label="Read-only comparison"
        >
          {original}
        </pre>
        <textarea
          ref={input}
          onFocus={() => model.current.focusListeners.forEach((listener) => listener())}
          aria-label="Editable merge result"
          value={value}
          readOnly={Boolean(options.readOnly)}
          onChange={(event) => notify(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
              event.preventDefault()
              const previous = model.current.undo.pop()
              if (previous !== undefined) notify(previous)
            }
          }}
        />
      </div>
    )
  }
  return { DiffEditor }
})

const translate = (key: string, args: Record<string, unknown> = {}) => {
  const value = (enUS as Record<string, string>)[key]
  return typeof value === 'string'
    ? value.replace(/{{(\w+)}}/g, (_, name: string) => String(args[name] ?? ''))
    : key
}
export const markedResult =
  'start\n<<<<<<< HEAD\ncurrent();\n||||||| base\nprevious();\n=======\nincoming();\n>>>>>>> feature\nend\n'
export const conflictSnapshot = {
  path: 'example.ts',
  base: 'previous();\n',
  ours: 'current();\n',
  theirs: 'incoming();\n',
  result: markedResult,
  revision: 'a'.repeat(64),
  deleted: false,
  markerSize: 7,
}
export const conflictStatus = {
  repo: { is_repository: true },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
}
export const resetConflictMocks = () => {
  vi.resetAllMocks()
  for (const root of ['/repo', '/other'])
    for (const file of ['example.ts', 'other.ts']) {
      discardGitConflictDraft(root, file)
      cancelGitConflictClose(root, file)
    }
  facade.mockReturnValue(conflictApi)
  configure.mockResolvedValue({})
  conflictApi.getConflict.mockResolvedValue(conflictSnapshot)
  conflictApi.saveConflict.mockResolvedValue({
    status: conflictStatus,
    revision: 'b'.repeat(64),
    staged: false,
  })
}
export const renderConflict = (element: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>), client }
}
export { conflictApi, configure, facade, monacoState }
