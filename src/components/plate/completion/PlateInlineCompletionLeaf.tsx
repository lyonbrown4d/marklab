import type { TText } from 'platejs'
import type { HTMLAttributes, ReactNode } from 'react'
import { FilePlus2, FileText, Heading } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { menuItemStyles, menuSurfaceStyles } from '@/components/overlay/overlayStyles'
import { InlineCompletionGhost } from '@/components/plate/completion/InlineCompletionGhost'
import type { PlateInlineDocumentCompletion } from '@/components/plate/completion/types'
import type { PlateWorkspaceLinkItem } from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { inferPlatformFromUserAgent } from '@/runtime/environment'

type CompletionLeaf = TText & {
  plateDiagnosticMessage?: string
  plateDiagnosticSeverity?: 'error' | 'warning'
  plateInlineCompletionAccept?: (index?: number) => void
  plateInlineCompletionCandidates?: readonly PlateInlineDocumentCompletion[]
  plateInlineCompletionIndex?: number
  plateInlineCompletion?: string
  plateInlineCompletionKind?: 'ai' | 'document'
  plateWorkspaceLinkAccept?: (index?: number) => boolean
  plateWorkspaceLinkIndex?: number
  plateWorkspaceLinkItems?: readonly PlateWorkspaceLinkItem[]
}

const WorkspaceLinkCompletionMenu = ({
  accept,
  activeIndex,
  items,
  label,
}: {
  accept?: (index: number) => void
  activeIndex: number
  items: readonly PlateWorkspaceLinkItem[]
  label: string
}) => (
  <Popover open>
    <PopoverAnchor asChild>
      <span
        aria-hidden="true"
        className="pointer-events-none inline-block size-0"
        contentEditable={false}
        data-workspace-link-completion-anchor=""
      />
    </PopoverAnchor>
    <PopoverContent
      align="start"
      className={cn(menuSurfaceStyles(), 'w-[min(30rem,calc(100vw-2rem))]')}
      contentEditable={false}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => event.preventDefault()}
      side="bottom"
      sideOffset={6}
    >
      <div aria-label={label} role="listbox">
        {items.map((item, index) => {
          const Icon =
            item.kind === 'create-file'
              ? FilePlus2
              : item.kind === 'heading' || item.kind === 'replace-anchor'
                ? Heading
                : FileText
          return (
            <Button
              aria-selected={index === activeIndex}
              className={cn(menuItemStyles(), 'h-auto w-full justify-start text-left font-normal')}
              data-active={index === activeIndex ? 'true' : undefined}
              key={`${item.kind}:${item.label}:${item.insertText}`}
              onMouseDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                accept?.(index)
              }}
              role="option"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.detail ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </span>
            </Button>
          )
        })}
      </div>
    </PopoverContent>
  </Popover>
)

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
        className={cn(menuSurfaceStyles(), 'w-auto min-w-64 max-w-[min(24rem,calc(100vw-2rem))]')}
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
                if (event.button !== 0) return
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
                className="shrink-0 text-[0.6875rem] text-muted-foreground"
                data-completion-meta=""
              >
                {t('editor.completionSourceDocument')}
              </span>
            </Button>
          ))}
        </div>
        <div
          className="border-t border-border/60 px-2 pt-1.5 text-[0.6875rem] text-muted-foreground"
          data-completion-footer=""
        >
          {t('editor.completionHint')}
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
  const workspaceLinkItems = completionLeaf.plateWorkspaceLinkItems ?? []
  const text = completionLeaf.plateInlineCompletion
  const singleDocumentCandidate =
    completionLeaf.plateInlineCompletionKind === 'document' && candidates.length === 1
      ? candidates[0]
      : null
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
      {workspaceLinkItems.length ? (
        <WorkspaceLinkCompletionMenu
          accept={completionLeaf.plateWorkspaceLinkAccept}
          activeIndex={completionLeaf.plateWorkspaceLinkIndex ?? 0}
          items={workspaceLinkItems}
          label={t('editor.workspaceLinkSuggestions')}
        />
      ) : singleDocumentCandidate ? (
        <InlineCompletionGhost
          accept={() => completionLeaf.plateInlineCompletionAccept?.(0)}
          acceptLabel={t('editor.completionAccept')}
          dismissLabel={t('editor.completionDismiss')}
          source="document"
          sourceLabel={t('editor.completionSourceDocument')}
          text={singleDocumentCandidate.text}
        />
      ) : completionLeaf.plateInlineCompletionKind === 'document' && candidates.length > 1 ? (
        <DocumentCompletionMenu
          accept={completionLeaf.plateInlineCompletionAccept}
          activeIndex={completionLeaf.plateInlineCompletionIndex ?? 0}
          candidates={candidates}
        />
      ) : completionLeaf.plateInlineCompletionKind === 'ai' && text ? (
        <InlineCompletionGhost
          acceptLabel={t('editor.completionAccept')}
          acceptWordLabel={t('editor.completionAcceptWord')}
          dismissLabel={t('editor.completionDismiss')}
          partialAcceptShortcut={inferPlatformFromUserAgent() === 'macos' ? '⌘→' : 'Ctrl+→'}
          source="ai"
          sourceLabel={t('editor.completionSourceAi')}
          text={text}
        />
      ) : null}
    </span>
  )
}
