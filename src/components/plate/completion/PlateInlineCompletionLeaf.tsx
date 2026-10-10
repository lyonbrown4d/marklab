import type { TText } from 'platejs'
import type { HTMLAttributes, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { menuItemStyles, menuSurfaceStyles } from '@/components/overlay/overlayStyles'
import type { PlateInlineDocumentCompletion } from '@/components/plate/completion/types'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

type CompletionLeaf = TText & {
  plateDiagnosticMessage?: string
  plateDiagnosticSeverity?: 'error' | 'warning'
  plateInlineCompletionAccept?: (index?: number) => void
  plateInlineCompletionCandidates?: readonly PlateInlineDocumentCompletion[]
  plateInlineCompletionIndex?: number
  plateInlineCompletion?: string
  plateInlineCompletionKind?: 'ai' | 'document'
}

type PlateInlineCompletionLeafProps = {
  attributes: HTMLAttributes<HTMLSpanElement>
  children: ReactNode
  leaf: TText
}

const DocumentCompletionMenu = ({
  accept,
  activeIndex,
  candidates,
}: {
  accept?: (index: number) => void
  activeIndex: number
  candidates: readonly PlateInlineDocumentCompletion[]
}) => {
  const { t } = useI18n()
  const activeCandidate = candidates[activeIndex]
  return (
    <Popover open>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none inline-block size-0"
          contentEditable={false}
          data-completion-anchor=""
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={cn(menuSurfaceStyles(), 'w-[min(28rem,calc(100vw-2rem))]')}
        contentEditable={false}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={6}
      >
        <span aria-live="polite" className="sr-only" role="status">
          {activeCandidate?.text.replace(/\s+/gu, ' ').trim()}
        </span>
        <div aria-label={t('editor.completionSuggestions')} role="listbox">
          {candidates.map((candidate, index) => (
            <Button
              aria-selected={index === activeIndex}
              data-active={index === activeIndex ? 'true' : undefined}
              className={cn(
                menuItemStyles(),
                'group h-auto w-full justify-start text-left font-normal',
              )}
              key={`${candidate.source}:${candidate.text}`}
              onMouseDown={(event) => {
                event.preventDefault()
                accept?.(index)
              }}
              role="option"
              type="button"
              variant="ghost"
            >
              <span className="min-w-0 flex-1 truncate">
                {candidate.text.replace(/\s+/gu, ' ').trim()}
              </span>
              <span
                className="shrink-0 text-[0.6875rem] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                data-completion-meta=""
              >
                {t('editor.completionSourceDocument')}
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const PlateInlineCompletionLeaf = ({
  attributes,
  children,
  leaf,
}: PlateInlineCompletionLeafProps) => {
  const { t } = useI18n()
  const completionLeaf = leaf as CompletionLeaf
  const candidates = completionLeaf.plateInlineCompletionCandidates ?? []
  const text = completionLeaf.plateInlineCompletion
  return (
    <span
      {...attributes}
      aria-invalid={completionLeaf.plateDiagnosticSeverity === 'error' ? 'true' : undefined}
      className={cn(
        attributes.className,
        completionLeaf.plateDiagnosticSeverity &&
          'underline decoration-wavy decoration-1 underline-offset-[3px]',
        completionLeaf.plateDiagnosticSeverity === 'error' && 'decoration-destructive',
        completionLeaf.plateDiagnosticSeverity === 'warning' && 'decoration-amber-500',
      )}
      data-diagnostic-message={completionLeaf.plateDiagnosticMessage}
      data-diagnostic-severity={completionLeaf.plateDiagnosticSeverity}
    >
      {children}
      {completionLeaf.plateInlineCompletionKind === 'document' && candidates.length ? (
        <DocumentCompletionMenu
          accept={completionLeaf.plateInlineCompletionAccept}
          activeIndex={completionLeaf.plateInlineCompletionIndex ?? 0}
          candidates={candidates}
        />
      ) : completionLeaf.plateInlineCompletionKind === 'ai' && text ? (
        <span aria-hidden="true" contentEditable={false} data-completion-kind="ai">
          <span className="marklab-ai-ghost-text">{text}</span>
          <span className="marklab-ai-ghost-meta" data-ai-completion-hint="">
            <span data-ai-completion-source="">{t('editor.completionSourceAi')}</span>
            <span>Tab {t('editor.completionAccept')}</span>
            <span>Ctrl+→ {t('editor.completionAcceptWord')}</span>
            <span>Esc {t('editor.completionDismiss')}</span>
          </span>
        </span>
      ) : null}
    </span>
  )
}
