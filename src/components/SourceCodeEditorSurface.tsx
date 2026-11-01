import Editor, { type OnMount } from '@monaco-editor/react'
import { useRef, useState } from 'react'
import { useMonacoVim } from '@/components/vim/useMonacoVim'
import { MonacoVimStatus } from '@/components/vim/MonacoVimStatus'
import { createSourceVimCommands } from '@/components/vim/vimCommands'
import { useEditorVimMode } from '@/components/vim/useEditorVimMode'
import { AlertTriangle } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { cn } from '@/lib/utils'
import { EditorContextMenu, type EditorContextMenuAdapter } from '@/components/EditorContextMenu'
import type { ShortcutBindings } from '@/logic/shortcuts'
import { monacoLanguageForPath } from '@/logic/sourceLanguages'
import type { EditorChangeHandler } from '@/types/editorChanges'
import { toEditorTextChanges } from '@/components/sourceCodeChanges'
import { useCachedEditorInteractionGate } from '@/components/useCachedEditorInteractionGate'
import { monacoSuggestionOptions } from '@/components/source-code/monacoSuggestionOptions'
import { manualTextInputAttributes } from '@/components/editor/manualTextInputAttributes'
import { useWorkspacePane } from '@/features/workbench/paneContext'
import { useWorkbenchSourceModel } from '@/components/source-code/useWorkbenchSourceModel'

type SourceCodeEditorSurfaceProps = {
  activePath: string | null
  interactionActive?: boolean
  workspaceKey: string
  darkMode: boolean
  errorMessage: string | null
  immersiveFocusMode: boolean
  immersiveTypewriterMode: boolean
  immersiveZenMode: boolean
  monacoReady: boolean
  motionAnimatedCursor: boolean
  motionSmoothScrolling: boolean
  readOnly?: boolean
  sourceCodeMiniMapEnabled: boolean
  shortcutOverrides?: ShortcutBindings
  loadingLabel: string
  value: string
  onChange: EditorChangeHandler
  onMount: OnMount
  contextMenu?: EditorContextMenuAdapter
}

export const SourceCodeEditorSurface = ({
  activePath,
  interactionActive,
  workspaceKey,
  darkMode,
  errorMessage,
  immersiveFocusMode,
  immersiveTypewriterMode,
  immersiveZenMode,
  monacoReady,
  motionAnimatedCursor,
  motionSmoothScrolling,
  readOnly = false,
  sourceCodeMiniMapEnabled,
  shortcutOverrides,
  loadingLabel,
  value,
  onChange,
  onMount,
  contextMenu,
}: SourceCodeEditorSurfaceProps) => {
  const pane = useWorkspacePane()
  const routeInteractionActive = (interactionActive ?? true) && (pane?.active ?? true)
  const acceptsLocalChanges = useCachedEditorInteractionGate(routeInteractionActive)
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null)
  useWorkbenchSourceModel(editor, pane?.id)
  const rootRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const vimEnabled = useEditorVimMode({ workspaceKey, path: activePath ?? '' })
  const language = monacoLanguageForPath(activePath ?? '')
  const modelPath = sourceCodeModelPath(workspaceKey, activePath)
  const vimError = useMonacoVim({
    editor,
    enabled: vimEnabled && monacoReady && !readOnly && !errorMessage,
    interactive: routeInteractionActive,
    modelKey: modelPath,
    rootRef,
    statusRef,
    acceptsChanges: acceptsLocalChanges,
    createCommands: (isCurrent) =>
      createSourceVimCommands({
        path: activePath,
        workspaceKey,
        isCurrent,
      }),
  })
  const surface = (
    <div
      {...manualTextInputAttributes}
      ref={rootRef}
      className={cn(
        'source-code-editor flex h-full flex-col overflow-hidden',
        immersiveZenMode && 'is-zen-editor',
        immersiveFocusMode && 'is-focus-editor',
        immersiveTypewriterMode && 'is-typewriter-editor',
        readOnly && 'is-readonly-editor',
      )}
    >
      {errorMessage ? (
        <div className="flex h-full items-center justify-center p-6">
          <AppAlert
            className="max-w-lg"
            descriptionClassName="text-sm"
            icon={<AlertTriangle aria-hidden="true" />}
            tone="destructive"
          >
            {errorMessage}
          </AppAlert>
        </div>
      ) : monacoReady ? (
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            loading={<DocumentLoadingState className="h-full p-6" label={loadingLabel} />}
            language={language}
            theme={darkMode ? 'vs-dark' : 'vs'}
            path={modelPath}
            // The wrapper's controlled readOnly updates call setValue and erase shared undo.
            // Workbench external values use the existing executeEdits synchronizer instead.
            defaultValue={pane ? value : undefined}
            value={pane ? undefined : value}
            keepCurrentModel={Boolean(pane)}
            saveViewState={!pane}
            onChange={(next, event) => {
              if (!acceptsLocalChanges()) return
              onChange(next ?? '', event ? toEditorTextChanges(event.changes) : undefined)
            }}
            onMount={(host, monaco) => {
              setEditor(host)
              onMount(host, monaco)
            }}
            options={{
              ...monacoSuggestionOptions,
              contextmenu: false,
              readOnly,
              domReadOnly: readOnly,
              minimap: { enabled: sourceCodeMiniMapEnabled },
              wordWrap: 'on',
              tabSize: 2,
              scrollBeyondLastLine: false,
              fontSize: 14,
              lineNumbers: 'on',
              renderLineHighlight: immersiveFocusMode ? 'all' : 'line',
              smoothScrolling: motionSmoothScrolling,
              cursorBlinking: motionAnimatedCursor ? 'smooth' : 'blink',
              cursorSmoothCaretAnimation: motionAnimatedCursor ? 'on' : 'off',
              cursorSurroundingLines: immersiveTypewriterMode ? 8 : 3,
              cursorSurroundingLinesStyle: 'all',
              cursorWidth: 2,
              renderWhitespace: 'selection',
              automaticLayout: true,
              lineNumbersMinChars: 3,
              padding: {
                top: immersiveTypewriterMode ? 120 : 24,
                bottom: immersiveTypewriterMode ? 180 : 24,
              },
            }}
          />
        </div>
      ) : (
        <DocumentLoadingState className="h-full p-6" label={loadingLabel} />
      )}
      <MonacoVimStatus statusRef={statusRef} error={vimError} />
    </div>
  )

  if (!contextMenu || !monacoReady || errorMessage) return surface
  return (
    <EditorContextMenu
      getCapabilities={() => (routeInteractionActive ? contextMenu.getCapabilities() : {})}
      onAction={(action) => {
        if (routeInteractionActive) contextMenu.onAction(action)
      }}
      showFormatting={language === 'markdown'}
      shortcutOverrides={shortcutOverrides}
    >
      {surface}
    </EditorContextMenu>
  )
}

export const sourceCodeModelPath = (workspaceKey: string, activePath: string | null): string =>
  `marklab-source://model/${encodeURIComponent(workspaceKey)}/${encodeURIComponent(activePath ?? 'marklab-empty.md')}`
