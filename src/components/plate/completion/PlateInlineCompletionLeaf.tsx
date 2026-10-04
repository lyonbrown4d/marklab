import type { TText } from 'platejs'
import type { HTMLAttributes, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { PlateInlineCompletionCandidate } from '@/components/plate/completion/types'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

type CompletionLeaf = TText & {
  plateInlineCompletionAccept?: (index: number) => void
  plateInlineCompletionCandidates?: readonly PlateInlineCompletionCandidate[]
  plateInlineCompletionIndex?: number
  plateInlineCompletion?: string
  plateInlineCompletionSource?: 'ai' | 'document'
}

type PlateInlineCompletionLeafProps = {
  attributes: HTMLAttributes<HTMLSpanElement>
  children: ReactNode
  leaf: TText
}

const CompletionCandidates = ({
  accept,
  activeIndex,
  candidates,
  source,
  text,
}: {
  accept?: (index: number) => void
  activeIndex: number
  candidates: readonly PlateInlineCompletionCandidate[]
  source?: PlateInlineCompletionCandidate['source']
  text: string
}) => {
  const { t } = useI18n()
  const activeCandidate = candidates[activeIndex]
  const ghost = (
    <span
      aria-hidden="true"
      className="marklab-ai-ghost-text"
      contentEditable={false}
      data-source={source}
    >
      {text}
    </span>
  )
  return (
    <Popover open>
      <PopoverAnchor asChild>{ghost}</PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-1"
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
              className={cn(
                'h-auto w-full justify-start gap-3 px-2.5 py-2 text-left font-normal',
                index === activeIndex && 'bg-accent text-accent-foreground',
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
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                {t(
                  candidate.source === 'ai'
                    ? 'editor.completionSourceAi'
                    : 'editor.completionSourceDocument',
                )}
              </span>
            </Button>
          ))}
        </div>
        <div className="border-t px-2.5 py-1.5 text-[0.6875rem] text-muted-foreground">
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
  const completionLeaf = leaf as CompletionLeaf
  const candidates = completionLeaf.plateInlineCompletionCandidates ?? []
  const text = completionLeaf.plateInlineCompletion
  return (
    <span {...attributes}>
      {children}
      {text && candidates.length ? (
        <CompletionCandidates
          accept={completionLeaf.plateInlineCompletionAccept}
          activeIndex={completionLeaf.plateInlineCompletionIndex ?? 0}
          candidates={candidates}
          source={completionLeaf.plateInlineCompletionSource}
          text={text}
        />
      ) : text ? (
        <span
          aria-hidden="true"
          className="marklab-ai-ghost-text"
          contentEditable={false}
          data-source={completionLeaf.plateInlineCompletionSource}
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}
