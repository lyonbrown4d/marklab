import type { PlateSlashCommand, PlateSlashCommandLabels } from '@/components/plate/slash/types'
import { getPlateSlashGroupLabel } from '@/components/plate/slash/plateSlashCommands'
import { useEffect } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

type PlateSlashMenuProps = {
  anchor: { left: number; top: number }
  commands: readonly PlateSlashCommand[]
  labels: PlateSlashCommandLabels
  onDismiss: () => void
  onSelect: (command: PlateSlashCommand) => void
  onSelectedIndexChange: (index: number) => void
  open: boolean
  selectedIndex: number
}

const groups = ['text', 'list', 'advanced'] as const

export const PlateSlashMenu = ({
  anchor,
  commands,
  labels,
  onDismiss,
  onSelect,
  onSelectedIndexChange,
  open,
  selectedIndex,
}: PlateSlashMenuProps) => {
  const selectedValue = commands[selectedIndex]?.key ?? ''

  useEffect(() => {
    if (!open) return
    document
      .querySelector<HTMLElement>('[data-plate-slash-menu] [data-slash-selected]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex])

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-px"
          style={{ left: anchor.left, top: anchor.top }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
      >
        <Command
          data-plate-slash-menu=""
          onValueChange={(value) => {
            const nextIndex = commands.findIndex((command) => command.key === value)
            if (nextIndex >= 0 && nextIndex !== selectedIndex) onSelectedIndexChange(nextIndex)
          }}
          shouldFilter={false}
          value={selectedValue}
        >
          <CommandList className="max-h-80 p-1">
            {commands.length === 0 && <CommandEmpty>{labels.noResults}</CommandEmpty>}
            {groups.map((group) => {
              const groupCommands = commands.filter((command) => command.group === group)
              if (groupCommands.length === 0) return null
              return (
                <CommandGroup heading={getPlateSlashGroupLabel(group, labels)} key={group}>
                  {groupCommands.map((command) => {
                    const Icon = command.icon
                    return (
                      <CommandItem
                        aria-label={command.label}
                        data-slash-selected={command.key === selectedValue ? '' : undefined}
                        key={command.key}
                        onMouseDown={(event) => event.preventDefault()}
                        onSelect={() => onSelect(command)}
                        value={command.key}
                      >
                        <Icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{command.label}</span>
                        {command.aliases.length > 0 && (
                          <span className="truncate text-xs text-muted-foreground">
                            {command.aliases.join(' ')}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
