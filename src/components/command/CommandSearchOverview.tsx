import type { KeyboardEvent } from 'react'
import { FileSearch, Search, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

export type CommandDialogMode = 'quick-open' | 'full-text' | 'commands'

type CommandSearchOverviewProps = {
  mode: CommandDialogMode
  onSelectMode: (mode: CommandDialogMode) => void
}

const modes = [
  { icon: FileSearch, id: 'quick-open', labelKey: 'command.mode.quickOpen', shortcut: '1' },
  { icon: Search, id: 'full-text', labelKey: 'command.mode.fullText', shortcut: '2' },
  { icon: Terminal, id: 'commands', labelKey: 'command.mode.commands', shortcut: '3' },
] as const

const CommandSearchOverview = ({ mode, onSelectMode }: CommandSearchOverviewProps) => {
  const { t } = useI18n()

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? modes.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length
    onSelectMode(modes[nextIndex].id)
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[nextIndex]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={t('command.mode.label')}
      className="mx-4 grid grid-cols-3 rounded-xl bg-muted/55 p-1"
    >
      {modes.map(({ icon: Icon, id, labelKey, shortcut }, index) => {
        const selected = mode === id
        return (
          <Button
            key={id}
            id={`command-mode-tab-${id}`}
            type="button"
            role="tab"
            aria-controls="command-mode-results"
            size="sm"
            variant="ghost"
            aria-label={t(labelKey)}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'h-10 gap-2 rounded-lg border border-transparent text-sm font-medium text-muted-foreground shadow-none',
              selected &&
                'border-border/70 bg-background text-foreground shadow-sm hover:bg-background',
            )}
            onClick={() => onSelectMode(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Icon className="size-4" />
            <span>{t(labelKey)}</span>
            <kbd
              aria-hidden="true"
              className="ml-1 hidden text-[10px] font-normal text-muted-foreground/70 sm:inline"
            >
              {shortcut}
            </kbd>
          </Button>
        )
      })}
    </div>
  )
}

export default CommandSearchOverview
