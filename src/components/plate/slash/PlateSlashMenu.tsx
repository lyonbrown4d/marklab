import type { PlateSlashCommand, PlateSlashCommandLabels } from '@/components/plate/slash/types'
import { getPlateSlashGroupLabel } from '@/components/plate/slash/plateSlashCommands'
import { EditorSuggestionMenu } from '@/components/menu/EditorSuggestionMenu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

type PlateSlashMenuProps = {
  anchor: { left: number; top: number }
  commands: readonly PlateSlashCommand[]
  labels: PlateSlashCommandLabels
  menuId?: string
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
  menuId,
  onDismiss,
  onSelect,
  onSelectedIndexChange,
  open,
  selectedIndex,
}: PlateSlashMenuProps) => {
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
        className="w-80 border-0 bg-transparent p-0 shadow-none motion-reduce:animate-none"
        collisionPadding={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
        sideOffset={6}
      >
        <EditorSuggestionMenu
          activeIndex={selectedIndex}
          emptyLabel={labels.noResults}
          getGroup={(command) => command.group}
          getId={(command) => command.key}
          getLabel={(command) => command.label}
          groups={groups.map((group) => ({
            id: group,
            label: getPlateSlashGroupLabel(group, labels),
          }))}
          items={commands}
          label={labels.menuLabel}
          menuId={menuId}
          onActiveIndexChange={onSelectedIndexChange}
          onSelect={onSelect}
          renderLeading={(command) => {
            const Icon = command.icon
            return <Icon aria-hidden="true" />
          }}
          renderMeta={(command) => command.aliases.join(' ')}
          selectionHint="Enter"
        />
      </PopoverContent>
    </Popover>
  )
}
