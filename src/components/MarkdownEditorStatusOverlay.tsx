import { AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import type { MarkdownEditorStatus } from '@/components/milkdown/markdownEditorTypes'

type MarkdownEditorStatusOverlayProps = {
  errorLabel: string
  loadingLabel: string
  status: MarkdownEditorStatus
}

const MarkdownEditorStatusOverlay = ({
  errorLabel,
  loadingLabel,
  status,
}: MarkdownEditorStatusOverlayProps) => {
  if (status.phase === 'ready') return null

  const isError = status.phase === 'error'

  return (
    <div
      className="markdown-editor-status-overlay"
      aria-atomic="true"
      aria-live={isError ? 'assertive' : 'polite'}
      role={isError ? 'alert' : 'status'}
    >
      <div className="markdown-editor-status-panel">
        {isError ? (
          <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
        ) : (
          <Spinner aria-hidden="true" />
        )}
        <span>{isError ? status.message || errorLabel : loadingLabel}</span>
      </div>
    </div>
  )
}

export default MarkdownEditorStatusOverlay
