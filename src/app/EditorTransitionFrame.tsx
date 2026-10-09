import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
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

type TransitionPhase = 'idle' | 'loading' | 'parsing' | 'restoring' | 'error'

const TRANSITION_PHASE_MS = 70
const EDITOR_FOCUS_TARGET =
  '[data-focus-entry], button:not([disabled]), a[href], [contenteditable="true"], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const EditorTransitionFrame = ({
  children,
  errorMessage,
  onRetry,
  requestKey,
  status,
}: EditorTransitionFrameProps) => {
  const { t } = useI18n()
  const [committed, setCommitted] = useState(() => ({ children, requestKey }))
  const [timedPhase, setTimedPhase] = useState<{
    requestKey: string
    phase: 'restoring'
  } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(false)
  const reducedMotion = prefersReducedMotion()

  useEffect(() => {
    if (requestKey === committed.requestKey || status !== 'ready') return
    const restoreTimer = reducedMotion
      ? null
      : window.setTimeout(
          () => setTimedPhase({ phase: 'restoring', requestKey }),
          TRANSITION_PHASE_MS,
        )
    const commitTimer = window.setTimeout(
      () => {
        setCommitted({ children, requestKey })
        setTimedPhase(null)
      },
      reducedMotion ? 0 : TRANSITION_PHASE_MS * 2,
    )

    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
      window.clearTimeout(commitTimer)
    }
  }, [children, committed.requestKey, reducedMotion, requestKey, status])

  const phase: TransitionPhase =
    requestKey === committed.requestKey
      ? status === 'ready'
        ? 'idle'
        : status
      : status !== 'ready'
        ? status
        : reducedMotion
          ? 'idle'
          : timedPhase?.requestKey === requestKey
            ? timedPhase.phase
            : 'parsing'
  const displayedChildren =
    status === 'ready' && (reducedMotion || requestKey === committed.requestKey)
      ? children
      : committed.children

  const busy = phase === 'loading' || phase === 'parsing' || phase === 'restoring'
  const transitioning = busy || phase === 'error' || requestKey !== committed.requestKey
  const statusLabel = busy ? t(`editor.transition.${phase}`) : ''
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
    if (busy || phase === 'error') {
      if (restoreFocusRef.current) frame.focus({ preventScroll: true })
      return
    }
    if (!restoreFocusRef.current) return
    const activeElement = document.activeElement
    if (
      activeElement !== frame &&
      activeElement !== document.body &&
      activeElement !== document.documentElement
    ) {
      restoreFocusRef.current = false
      return
    }
    content.querySelector<HTMLElement>(EDITOR_FOCUS_TARGET)?.focus({ preventScroll: true })
  }, [busy, phase, requestKey])

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
        inert={busy || phase === 'error' ? true : undefined}
        ref={contentRef}
        onBlurCapture={handleContentBlurCapture}
        onFocusCapture={handleContentFocusCapture}
      >
        {displayedChildren}
      </div>
      {busy ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center"
          role="status"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-popover/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <Spinner aria-hidden="true" className="size-3.5" />
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
