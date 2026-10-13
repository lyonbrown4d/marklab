import Editor from '@monaco-editor/react'
import { useState } from 'react'
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
  onCancel,
}: CodeBlockMonacoDialogProps) => {
  const [draft, setDraft] = useState(source)
  const { error, ready } = useConfiguredMonaco()

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="h-[min(80vh,720px)] max-w-[min(90vw,1080px)] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden rounded-md border">
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
