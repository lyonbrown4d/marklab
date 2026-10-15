import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { ConflictBlock, ConflictChoice } from '@/features/git/conflicts/conflictMarkers'

type Props = {
  blocks: ConflictBlock[]
  disabled: boolean
  onChoose: (block: ConflictBlock, choice: ConflictChoice) => void
  onReveal: (line: number) => void
}
export const ConflictChoiceList = ({ blocks, disabled, onChoose, onReveal }: Props) => {
  const { t } = useI18n()
  if (!blocks.length) return null
  return (
    <ul
      className="max-h-28 shrink-0 divide-y divide-border overflow-auto border-b border-border px-3"
      aria-label={t('scm.merge.conflicts')}
    >
      {blocks.map((block, index) => (
        <li
          key={`${block.start}:${block.end}`}
          className="flex flex-wrap items-center gap-1 py-1 text-xs"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-xs"
            onClick={() => onReveal(block.line)}
          >
            {t('scm.merge.conflictAt', { number: index + 1, line: block.line })}
          </Button>
          <div className="ml-auto flex flex-wrap gap-1">
            {(['ours', 'theirs', 'both'] as const).map((choice) => (
              <Button
                key={choice}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                aria-label={t('scm.merge.choiceLabel', {
                  choice: t(`scm.merge.keep.${choice}`),
                  number: index + 1,
                })}
                onClick={() => onChoose(block, choice)}
              >
                {t(`scm.merge.keep.${choice}`)}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
