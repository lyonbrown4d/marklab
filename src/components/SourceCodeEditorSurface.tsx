import Editor, { type OnMount } from '@monaco-editor/react'
import { useRef, useState } from 'react'
import { useMonacoVim } from '@/components/vim/useMonacoVim'
import { MonacoVimStatus } from '@/components/vim/MonacoVimStatus'
import { createSourceVimCommands } from '@/components/vim/vimCommands'
import { useEditorVimMode } from '@/components/vim/useEditorVimMode'
import { useKeepAliveContext } from 'keepalive-for-react'
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
  const keepAlive = useKeepAliveContext()
  const routeInteractionActive = interactionActive ?? (!keepAlive.cacheKey || keepAlive.active)
  const acceptsLocalChanges = useCachedEditorInteractionGate(routeInteractionActive)
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null)
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
            value={value}
            onChange={(next, event) => {
              if (!acceptsLocalChanges()) return
              onChange(next ?? '', event ? toEditorTextChanges(event.changes) : undefined)
            }}
            onMount={(host, monaco) => {
              setEditor(host)
              onMount(host, monaco)
            }}
            options={{
              contextmenu: false,
              readOnly,
              domReadOnly: readOnly,
              minimap: { enabled: sourceCodeMiniMapEnabled },
              inlineSuggest: { enabled: true, showToolbar: 'onHover' },
              suggest: { preview: true },
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
      getCapabilities={contextMenu.getCapabilities}
      onAction={contextMenu.onAction}
      showFormatting={language === 'markdown'}
      shortcutOverrides={shortcutOverrides}
    >
      {surface}
    </EditorContextMenu>
  )
}

export const sourceCodeModelPath = (workspaceKey: string, activePath: string | null): string =>
  `marklab-source://model/${encodeURIComponent(workspaceKey)}/${encodeURIComponent(activePath ?? 'marklab-empty.md')}`
