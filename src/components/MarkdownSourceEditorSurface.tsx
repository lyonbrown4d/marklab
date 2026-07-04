import Editor, { type OnMount } from '@monaco-editor/react'
import { AlertTriangle } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type MarkdownSourceEditorSurfaceProps = {
  activePath: string | null
  darkMode: boolean
  errorMessage: string | null
  immersiveFocusMode: boolean
  immersiveTypewriterMode: boolean
  immersiveZenMode: boolean
  monacoReady: boolean
  motionAnimatedCursor: boolean
  motionSmoothScrolling: boolean
  sourceCodeMiniMapEnabled: boolean
  loadingLabel: string
  value: string
  onChange: (value: string) => void
  onMount: OnMount
}

export const MarkdownSourceEditorSurface = ({
  activePath,
  darkMode,
  errorMessage,
  immersiveFocusMode,
  immersiveTypewriterMode,
  immersiveZenMode,
  monacoReady,
  motionAnimatedCursor,
  motionSmoothScrolling,
  sourceCodeMiniMapEnabled,
  loadingLabel,
  value,
  onChange,
  onMount,
}: MarkdownSourceEditorSurfaceProps) => (
  <div
    className={cn(
      'markdown-source-editor h-full overflow-hidden',
      immersiveZenMode && 'is-zen-editor',
      immersiveFocusMode && 'is-focus-editor',
      immersiveTypewriterMode && 'is-typewriter-editor',
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
      <Editor
        height="100%"
        language="markdown"
        theme={darkMode ? 'vs-dark' : 'vs'}
        path={activePath ?? 'marklab-empty.md'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={onMount}
        options={{
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
    ) : (
      <div
        aria-busy="true"
        aria-label={loadingLabel}
        className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner aria-hidden="true" role="presentation" />
        <span>{loadingLabel}</span>
      </div>
    )}
  </div>
)
