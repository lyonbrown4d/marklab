import Editor from '@monaco-editor/react'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { useI18n } from '@/i18n/useI18n'
import { useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { useMonacoVim } from '@/components/vim/useMonacoVim'
import { MonacoVimStatus } from '@/components/vim/MonacoVimStatus'
import { isVimKeyboardTarget } from '@/components/vim/vimKeyboardScope'
import { useCurrentTabVimModeEnabled } from '@/components/vim/useEditorVimMode'
import { monacoCodeLanguage } from '@/components/plate/code/codeLanguageCatalog'
import { useConfiguredMonaco } from '@/components/source-code/useConfiguredMonaco'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'

type CodeBlockMonacoDialogProps = {
  cancelLabel: string
  applyLabel: string
  description: string
  language: string
  loadingLabel: string
  source: string
  title: string
  onApply: (source: string) => void
  onWrite?: (source: string) => void
  onCancel: () => void
}

const isDarkTheme = () => document.documentElement.classList.contains('dark')

const CodeBlockMonacoDialog = ({
  applyLabel,
  cancelLabel,
  description,
  language,
  loadingLabel,
  source,
  title,
  onApply,
  onWrite,
  onCancel,
}: CodeBlockMonacoDialogProps) => {
  const { t } = useI18n()
  const [draft, setDraft] = useState(source)
  const { error, ready } = useConfiguredMonaco()
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const savedDraftRef = useRef(source)
  const vimEnabled = useCurrentTabVimModeEnabled()
  const vimError = useMonacoVim({
    editor,
    enabled: vimEnabled && ready && !error,
    interactive: true,
    modelKey: language,
    rootRef,
    statusRef,
    acceptsChanges: () => true,
    createCommands: (isCurrent) => ({
      write: async () => {
        if (!isCurrent()) return
        if (!onWrite) throw new Error(t('editor.vimWriteUnavailable'))
        const next = editor?.getValue() ?? draft
        onWrite(next)
        await flushEditorChanges()
        if (isCurrent()) savedDraftRef.current = next
      },
      quit: () => {
        if (!isCurrent()) return
        if ((editor?.getValue() ?? draft) !== savedDraftRef.current) {
          throw new Error(t('editor.vimUnsavedCode'))
        }
        onCancel()
      },
    }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="h-[min(80vh,720px)] max-w-[min(90vw,1080px)] grid-rows-[auto_1fr_auto]"
        onEscapeKeyDown={(event) => {
          if (isVimKeyboardTarget(event.target)) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div ref={rootRef} className="flex min-h-0 flex-col overflow-hidden rounded-md border">
          <div className="min-h-0 flex-1">
            {error ? (
              <div
                className="flex h-full items-center justify-center p-6 text-sm text-destructive"
                role="alert"
              >
                {String(error)}
              </div>
            ) : ready ? (
              <Editor
                height="100%"
                loading={<DocumentLoadingState className="h-full p-6" label={loadingLabel} />}
                language={monacoCodeLanguage(language)}
                onMount={setEditor}
                onChange={(value) => setDraft(value ?? '')}
                options={{
                  automaticLayout: true,
                  lineNumbers: 'on',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  wordWrap: 'on',
                }}
                theme={isDarkTheme() ? 'vs-dark' : 'vs'}
                value={draft}
              />
            ) : (
              <DocumentLoadingState className="h-full p-6" label={loadingLabel} />
            )}
          </div>
          <MonacoVimStatus statusRef={statusRef} error={vimError} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button disabled={!ready || Boolean(error)} type="button" onClick={() => onApply(draft)}>
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CodeBlockMonacoDialog
