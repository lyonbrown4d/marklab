import { diffWordsWithSpace } from 'diff'
import { cn } from '@/lib/utils'

type AiProposalDiffProps = {
  label: string
  original: string
  proposal: string
}

export const AiProposalDiff = ({ label, original, proposal }: AiProposalDiffProps) => (
  <div
    aria-label={label}
    className="max-h-52 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary/25 px-4 py-2 text-sm leading-7 text-foreground"
  >
    {diffWordsWithSpace(original, proposal).map((part, index) => (
      <span
        className={cn(
          part.added && 'rounded-sm bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          part.removed && 'bg-red-500/10 text-red-600 line-through dark:text-red-300',
        )}
        key={`${index}-${part.added ? 'added' : part.removed ? 'removed' : 'same'}`}
      >
        {part.value}
      </span>
    ))}
  </div>
)
