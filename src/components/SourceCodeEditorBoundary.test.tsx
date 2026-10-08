import { render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceCodeEditor from '@/components/SourceCodeEditor'
import { configureMonaco } from '@/lib/monaco'

const markdownFeatures = vi.hoisted(() => ({
  disposeProviders: vi.fn(),
  disposeShortcuts: vi.fn(),
  registerProviders: vi.fn(() => ({ dispose: markdownFeatures.disposeProviders })),
  registerShortcuts: vi.fn(() => ({ dispose: markdownFeatures.disposeShortcuts })),
}))

const editor = vi.hoisted(() => ({
  getModel: vi.fn(() => ({ getValue: () => 'export const value = 1' })),
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
}))

const monaco = vi.hoisted(() => ({
  editor: {
    MarkerSeverity: { Error: 1, Warning: 2 },
    setModelMarkers: vi.fn(),
  },
}))

vi.mock('@/components/markdownSourceProviders', () => ({
  registerMarkdownSourceProviders: markdownFeatures.registerProviders,
}))

vi.mock('@/components/markdownSourceShortcuts', () => ({
  registerMarkdownSourceShortcuts: markdownFeatures.registerShortcuts,
}))

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/store/usePreferencesStore', () => ({ usePreferencesStore: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/monaco', () => ({ configureMonaco: vi.fn() }))

vi.mock('@monaco-editor/react', () => ({
  default: function MockMonacoEditor({
    onMount,
  }: {
    onMount?: (nextEditor: typeof editor, api: typeof monaco) => void
  }) {
    const mountRef = useRef(onMount)
    useEffect(() => mountRef.current?.(editor, monaco), [])
    return <textarea aria-label="source code" />
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(configureMonaco).mockResolvedValue(
    monaco as unknown as Awaited<ReturnType<typeof configureMonaco>>,
  )
})

describe('SourceCodeEditor Markdown feature boundary', () => {
  it('does not register Markdown providers or shortcuts for a source file', async () => {
    render(
      <SourceCodeEditor
        activePath="src/example.ts"
        workspaceKey="external:C:/notes"
        fileContents={{}}
        files={[{ kind: 'file', path: 'src/example.ts' }]}
        onChange={vi.fn()}
        value="export const value = 1"
      />,
    )

    await waitFor(() => expect(configureMonaco).toHaveBeenCalled())
    expect(markdownFeatures.registerProviders).not.toHaveBeenCalled()
    expect(markdownFeatures.registerShortcuts).not.toHaveBeenCalled()
    expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      expect.anything(),
      'markdown-source-link',
      [],
    )
  })

  it('disposes and restores Markdown features when switching file languages', async () => {
    const props = {
      fileContents: {},
      files: [],
      onChange: vi.fn(),
      value: '# Notes',
      workspaceKey: 'external:C:/notes',
    }
    const view = render(<SourceCodeEditor {...props} activePath="notes/current.md" />)
    await waitFor(() => expect(markdownFeatures.registerProviders).toHaveBeenCalledTimes(1))
    expect(markdownFeatures.registerShortcuts).toHaveBeenCalled()

    view.rerender(
      <SourceCodeEditor {...props} activePath="src/example.ts" value="export const value = 1" />,
    )
    await waitFor(() => expect(markdownFeatures.disposeProviders).toHaveBeenCalled())
    expect(markdownFeatures.disposeShortcuts).toHaveBeenCalled()

    view.rerender(<SourceCodeEditor {...props} activePath="notes/next.md" />)
    await waitFor(() => expect(markdownFeatures.registerProviders).toHaveBeenCalledTimes(2))
    expect(markdownFeatures.registerShortcuts).toHaveBeenCalledTimes(2)
  })
})
