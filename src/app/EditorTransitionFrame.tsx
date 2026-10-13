import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentLoadingLines } from '@/components/loading/DocumentLoadingLines'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

export type EditorTransitionStatus = 'loading' | 'ready' | 'error'

type EditorTransitionFrameProps = {
  children: ReactNode
  errorMessage?: string
  onRetry?: () => void
  requestKey: string
  status: EditorTransitionStatus
}

const EDITOR_FOCUS_TARGET =
  '[data-focus-entry], button:not([disabled]), a[href], [contenteditable="true"], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const EditorTransitionFrame = ({
  children,
  errorMessage,
  onRetry,
  requestKey,
  status,
}: EditorTransitionFrameProps) => {
  const { t } = useI18n()
  const [committed, setCommitted] = useState(() => ({ children, requestKey }))
  const contentRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(false)

  // Keep the last ready surface, including live edits, available during the next load.
  if (
    status === 'ready' &&
    (committed.children !== children || committed.requestKey !== requestKey)
  ) {
    setCommitted({ children, requestKey })
  }

  const phase = status === 'ready' ? 'idle' : status
  const displayedChildren = status === 'ready' ? children : committed.children
  const busy = status === 'loading'
  const transitioning = status !== 'ready'
  const statusLabel = busy ? t('editor.transition.loading') : ''
  const handleContentFocusCapture = () => {
    restoreFocusRef.current = true
  }
  const handleContentBlurCapture = () => {
    if (!transitioning) restoreFocusRef.current = false
  }

  useLayoutEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    if (!frame || !content) return
    const activeElement = document.activeElement
    if (
      restoreFocusRef.current &&
      activeElement !== frame &&
      activeElement !== document.body &&
      activeElement !== document.documentElement &&
      !content.contains(activeElement)
    ) {
      restoreFocusRef.current = false
    }
    if (transitioning) {
      if (restoreFocusRef.current) frame.focus({ preventScroll: true })
      const handleFocusOutside = (event: FocusEvent) => {
        if (event.target !== frame && !content.contains(event.target as Node)) {
          restoreFocusRef.current = false
        }
      }
      document.addEventListener('focusin', handleFocusOutside)
      return () => document.removeEventListener('focusin', handleFocusOutside)
    }
    if (!restoreFocusRef.current || content.contains(activeElement)) return
    content.querySelector<HTMLElement>(EDITOR_FOCUS_TARGET)?.focus({ preventScroll: true })
  }, [requestKey, transitioning])

  return (
    <div
      aria-busy={busy}
      aria-label={
        transitioning
          ? busy
            ? statusLabel
            : errorMessage || t('editor.openFileFailed')
          : undefined
      }
      className={cn(
        'relative h-full overflow-hidden outline-none',
        transitioning &&
          'focus:ring-2 focus:ring-inset focus:ring-ring/60 motion-reduce:transition-none',
      )}
      data-editor-transition-phase={phase}
      ref={frameRef}
      role="group"
      tabIndex={-1}
    >
      <div
        className={cn(
          'h-full transition-opacity duration-[140ms] ease-out motion-reduce:transition-none',
          busy && 'pointer-events-none select-none opacity-70',
        )}
        data-testid="editor-transition-content"
        inert={transitioning ? true : undefined}
        ref={contentRef}
        onBlurCapture={handleContentBlurCapture}
        onFocusCapture={handleContentFocusCapture}
      >
        {displayedChildren}
      </div>
      {busy ? (
        <div
          aria-live="polite"
          className="editor-transition-loading pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center"
          role="status"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-popover/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <DocumentLoadingLines compact />
            <span>{statusLabel}</span>
          </div>
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="absolute inset-x-0 top-3 z-30 flex justify-center" role="alert">
          <div className="flex max-w-[min(560px,90vw)] items-center gap-2 rounded-lg border border-destructive/30 bg-popover px-3 py-2 text-xs shadow-md">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {errorMessage || t('editor.openFileFailed')}
            </span>
            {onRetry ? (
              <Button onClick={onRetry} size="sm" variant="outline">
                {t('editor.transition.retry')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
