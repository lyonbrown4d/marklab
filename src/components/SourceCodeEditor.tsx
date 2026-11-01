import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLatest } from 'ahooks'
import type { EditorCursorPosition } from '@/components/EditorDocumentStatus'
import type { OnMount } from '@monaco-editor/react'
import { useDarkMode } from '@/hooks/useDarkMode'
import { MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER } from '@/logic/markdownDiagnostics'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import { registerMarkdownSourceProviders } from '@/components/markdownSourceProviders'
import { SourceCodeEditorSurface } from '@/components/SourceCodeEditorSurface'
import { useI18n } from '@/i18n/useI18n'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'
import { registerMarkdownSourceShortcuts } from '@/components/markdownSourceShortcuts'
import { useSourceCodeContextMenu } from '@/components/sourceCodeContextMenu'
import {
  useMarkdownSourceDiagnostics,
  type MarkdownSourceDiagnosticHost,
} from '@/components/useMarkdownSourceDiagnostics'
import type { EditorChangeHandler } from '@/types/editorChanges'
import { useEditorFocusHandoffTarget } from '@/app/EditorFocusHandoff'
import { useConfiguredMonaco } from '@/components/source-code/useConfiguredMonaco'
import { useSourceCodeEditorExternalValue } from '@/components/source-code/useSourceCodeEditorExternalValue'
import { useSourceCodePositionNavigation } from '@/components/source-code/useSourceCodePositionNavigation'
import { useWorkspacePane } from '@/features/workbench/paneContext'

type SourceCodeEditorProps = {
  activePath: string | null
  workspaceKey: string
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  onChange: EditorChangeHandler
  onOpenFileView?: (path: string, view: FileViewKind) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
  readOnly?: boolean
  interactionActive?: boolean
}

const SourceCodeEditor = ({
  activePath,
  workspaceKey,
  value,
  files,
  fileContents,
  onChange,
  onOpenFileView,
  onCursorChange,
  readOnly = false,
  interactionActive: requestedInteractionActive,
}: SourceCodeEditorProps) => {
  const { t } = useI18n()
  const pane = useWorkspacePane()
  const interactionActive = (requestedInteractionActive ?? true) && (pane?.active ?? true)
  const interactionActiveRef = useLatest(interactionActive)
  const darkMode = useDarkMode()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const sourceCodeMiniMapEnabled = usePreferencesStore((state) => state.sourceCodeMiniMapEnabled)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const markdownEnabled = isMarkdownFilePath(activePath ?? '')
  const { error: monacoLoadError, ready: monacoReady } = useConfiguredMonaco()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const syncExternalValue = useSourceCodeEditorExternalValue({ editorRef, value })
  const cursorCallbackRef = useLatest(onCursorChange)
  const workspaceKeyRef = useLatest(workspaceKey)
  const focusSubscriptionRef = useRef<{ dispose: () => void } | null>(null)
  const cursorSubscriptionRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticHostRef = useRef<MarkdownSourceDiagnosticHost | null>(null)
  const providersDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const shortcutsDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const { completionContextRef, scheduleDiagnostics } = useMarkdownSourceDiagnostics({
    activePath,
    enabled: markdownEnabled,
    files,
    fileContents,
    hostRef: diagnosticHostRef,
  })
  const focusPendingSourcePosition = useSourceCodePositionNavigation({
    active: interactionActive,
    activePath,
    workspaceKey,
    editorRef,
    hostRef: diagnosticHostRef,
  })
  const previousMarkdownEnabledRef = useRef(markdownEnabled)
  const contextMenu = useSourceCodeContextMenu(editorRef, readOnly)
  const focusEditor = useCallback(() => {
    if (interactionActiveRef.current) editorRef.current?.focus()
  }, [interactionActiveRef])
  const isEditorMounted = useCallback(() => editorRef.current !== null, [])
  const focusHandoff = useEditorFocusHandoffTarget({
    active: interactionActive,
    focus: focusEditor,
    isReady: isEditorMounted,
    path: activePath,
    status: monacoLoadError ? 'error' : 'loading',
    view: 'source',
  })

  useLayoutEffect(() => {
    if (!interactionActive && editorRef.current) clearFocusedCodeEditor(editorRef.current)
  }, [interactionActive])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    syncExternalValue(editor)
    focusHandoff.reportReady()
    cursorSubscriptionRef.current?.dispose()
    cursorSubscriptionRef.current = editor.onDidChangeCursorPosition(({ position }) => {
      cursorCallbackRef.current?.(position)
    })
    cursorCallbackRef.current?.(editor.getPosition())
    if (interactionActiveRef.current) setFocusedCodeEditor(editor)
    focusSubscriptionRef.current?.dispose()
    focusSubscriptionRef.current = editor.onDidFocusEditorText(() => {
      if (interactionActiveRef.current) setFocusedCodeEditor(editor)
    })
    diagnosticHostRef.current = { editor, monaco: monaco as typeof import('monaco-editor') }

    providersDisposableRef.current?.dispose()
    providersDisposableRef.current = markdownEnabled
      ? registerMarkdownSourceProviders({
          monaco: monaco as typeof import('monaco-editor'),
          editor,
          getContext: () => completionContextRef.current,
          getWorkspaceKey: () => workspaceKeyRef.current,
          onOpenFileView,
          scheduleDiagnostics,
        })
      : null
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current =
      readOnly || !interactionActive || !markdownEnabled
        ? null
        : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })

    scheduleDiagnostics()
    focusPendingSourcePosition()
  }

  useEffect(() => {
    if (onCursorChange && editorRef.current) onCursorChange(editorRef.current.getPosition())
  }, [activePath, onCursorChange])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current =
      readOnly || !interactionActive || !markdownEnabled
        ? null
        : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })
  }, [interactionActive, markdownEnabled, readOnly, shortcutOverrides])

  useEffect(() => {
    if (previousMarkdownEnabledRef.current === markdownEnabled) return
    previousMarkdownEnabledRef.current = markdownEnabled
    const host = diagnosticHostRef.current
    if (!host) return

    providersDisposableRef.current?.dispose()
    providersDisposableRef.current = markdownEnabled
      ? registerMarkdownSourceProviders({
          monaco: host.monaco,
          editor: host.editor,
          getContext: () => completionContextRef.current,
          getWorkspaceKey: () => workspaceKeyRef.current,
          onOpenFileView,
          scheduleDiagnostics,
        })
      : null
    scheduleDiagnostics()
  }, [completionContextRef, markdownEnabled, onOpenFileView, scheduleDiagnostics, workspaceKeyRef])

  useEffect(() => {
    return () => {
      focusSubscriptionRef.current?.dispose()
      cursorSubscriptionRef.current?.dispose()
      providersDisposableRef.current?.dispose()
      providersDisposableRef.current = null
      shortcutsDisposableRef.current?.dispose()
      shortcutsDisposableRef.current = null

      const host = diagnosticHostRef.current
      const model = host?.editor.getModel()
      if (host && model) {
        host.monaco.editor.setModelMarkers(model, MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER, [])
      }
      if (host) {
        clearFocusedCodeEditor(host.editor)
      }
      diagnosticHostRef.current = null
      editorRef.current = null
    }
  }, [])

  const editorLoadError =
    monacoLoadError instanceof Error ? monacoLoadError.message : String(monacoLoadError)

  return (
    <SourceCodeEditorSurface
      activePath={activePath}
      interactionActive={interactionActive}
      workspaceKey={workspaceKey}
      darkMode={darkMode}
      errorMessage={
        monacoLoadError ? t('editor.sourceLoadFailed', { error: editorLoadError }) : null
      }
      immersiveFocusMode={immersiveFocusMode}
      immersiveTypewriterMode={immersiveTypewriterMode}
      immersiveZenMode={immersiveZenMode}
      loadingLabel={t('editor.sourceLoading')}
      monacoReady={monacoReady}
      motionAnimatedCursor={motionAnimatedCursor}
      motionSmoothScrolling={motionSmoothScrolling}
      readOnly={readOnly}
      sourceCodeMiniMapEnabled={sourceCodeMiniMapEnabled}
      shortcutOverrides={shortcutOverrides}
      value={value}
      contextMenu={contextMenu}
      onChange={onChange}
      onMount={handleMount}
    />
  )
}

export default SourceCodeEditor
