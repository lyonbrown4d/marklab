import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarkdownEditorHandle,
  MarkdownEditorStatus,
} from '@/components/editor/markdownEditorTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const editorBridge = vi.hoisted(() => ({
  statusChange: null as ((status: MarkdownEditorStatus) => void) | null,
}))

vi.mock('@/components/MarkdownEditor', () => ({
  default: forwardRef<
    MarkdownEditorHandle,
    { activePath: string | null; onStatusChange?: (status: MarkdownEditorStatus) => void }
  >(({ activePath, onStatusChange }, ref) => {
    const editorRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
      editorBridge.statusChange = onStatusChange ?? null
      return () => {
        if (editorBridge.statusChange === onStatusChange) editorBridge.statusChange = null
      }
    }, [onStatusChange])
    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.focus(),
      getMarkdown: async () => '',
    }))
    return (
      <div
        aria-label={`Editor ${activePath ?? ''}`}
        contentEditable
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
    )
  }),
}))

vi.mock('@/components/Sidebar', () => ({
  default: ({ onOpenFile }: { onOpenFile: (path: string) => void }) => (
    <button type="button" onClick={() => onOpenFile('notes/two.md')}>
      Open second file
    </button>
  ),
}))

vi.mock('@/components/RightSidebar', () => ({ default: () => null }))
vi.mock('@/components/ImmersiveWorkspaceShell', () => ({
  ImmersiveWorkspaceShell: ({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) => (
    <>
      {sidebar}
      {children}
    </>
  ),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import { AppWorkspacePanels } from '@/app/AppWorkspacePanels'
import WysiwygEditorPage from '@/pages/WysiwygEditorPage'

const action = vi.fn()

const FocusHandoffHarness = () => {
  const [path, setPath] = useState('notes/one.md')
  const tab = { kind: 'file' as const, path, view: 'edit' as const }
  const state = {
    activePath: path,
    activeResourcePath: path,
    activeTabId: `file:edit:${path}`,
    createFile: action,
    createFolder: action,
    deletePath: action,
    dirtyPaths: new Set<string>(),
    editorValue: '# Note',
    fileContents: { [path]: '# Note' },
    fileTree: [],
    files: [
      { kind: 'file' as const, path: 'notes/one.md' },
      { kind: 'file' as const, path: 'notes/two.md' },
    ],
    inspectedPath: path,
    movePath: action,
    onCloseTab: action,
    onInspectPath: action,
    onOpenTab: action,
    onPersistedContentChange: action,
    renamePath: action,
    rightSidebarCollapsed: true,
    rootKind: 'external' as const,
    rootPath: '/notes',
    saveStates: {},
    sidebarCollapsed: false,
    silentSave: true,
    tabs: [tab],
    viewMode: 'wysiwyg' as const,
    workspaceKey: 'external:/notes',
    workspaceView: 'files' as const,
  }

  return (
    <>
      <button type="button">Other action</button>
      <AppWorkspacePanels
        immersiveZenMode={false}
        onOpenFile={setPath}
        onOpenFileView={(nextPath) => setPath(nextPath)}
        onOpenGitDiff={action}
        onOpenSearchResult={action}
        outlet={
          <WysiwygEditorPage
            activePath={path}
            files={state.files}
            onChange={action}
            onOpenFile={setPath}
            readOnly={false}
            showStatusBar={false}
            value="# Note"
          />
        }
        state={state as never}
        totalFiles={2}
      />
    </>
  )
}

describe('AppWorkspacePanels editor focus handoff', () => {
  beforeEach(() => {
    editorBridge.statusChange = null
    usePreferencesStore.setState({ sidebarCollapsed: false })
  })

  it('closes the sidebar and focuses the selected editor only after it reports ready', async () => {
    render(<FocusHandoffHarness />)
    const openButton = screen.getByRole('button', { name: 'Open second file' })
    openButton.focus()
    fireEvent.click(openButton)

    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
    expect(document.activeElement).toBe(openButton)
    await waitFor(() => expect(editorBridge.statusChange).not.toBeNull())

    act(() => editorBridge.statusChange?.({ phase: 'ready' }))

    await waitFor(() => {
      expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Editor notes/two.md' }),
      )
    })
  })

  it('keeps the sidebar and tree focus when the selected editor reports an error', async () => {
    render(<FocusHandoffHarness />)
    const openButton = screen.getByRole('button', { name: 'Open second file' })
    openButton.focus()
    fireEvent.click(openButton)
    await waitFor(() => expect(editorBridge.statusChange).not.toBeNull())

    act(() => editorBridge.statusChange?.({ message: 'load failed', phase: 'error' }))

    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
    expect(document.activeElement).toBe(openButton)
  })

  it('does not steal focus when the user moves on before the editor is ready', async () => {
    render(<FocusHandoffHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open second file' }))
    await waitFor(() => expect(editorBridge.statusChange).not.toBeNull())
    const otherAction = screen.getByRole('button', { name: 'Other action' })
    fireEvent.pointerDown(otherAction)
    otherAction.focus()

    act(() => editorBridge.statusChange?.({ phase: 'ready' }))

    await waitFor(() => expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true))
    expect(document.activeElement).toBe(otherAction)
  })
})
