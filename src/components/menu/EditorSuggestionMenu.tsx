import { useEffect, useId, useRef, type ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { menuItemStyles, menuSurfaceStyles } from '@/components/overlay/overlayStyles'
import { cn } from '@/lib/utils'

type EditorSuggestionMenuBaseProps<T> = {
  activeIndex: number
  className?: string
  emptyLabel: string
  getId: (item: T) => string
  getLabel: (item: T) => string
  items: readonly T[]
  label: string
  menuId?: string
  onActiveIndexChange: (index: number) => void
  onSelect: (item: T) => void
  renderLeading?: (item: T) => ReactNode
  renderMeta?: (item: T) => ReactNode
  renderScreenReaderDescription?: (item: T) => ReactNode
  selectionHint?: string
}

type EditorSuggestionMenuGroupingProps<T> =
  | {
      getGroup: (item: T) => string
      groups: readonly { id: string; label: string }[]
    }
  | { getGroup?: never; groups?: never }

type EditorSuggestionMenuProps<T> = EditorSuggestionMenuBaseProps<T> &
  EditorSuggestionMenuGroupingProps<T>

const UNGROUPED_ID = '__ungrouped__'

export const getEditorSuggestionOptionId = (menuId: string, itemId: string, occurrence: number) =>
  `${menuId}-option-${encodeURIComponent(itemId)}-${occurrence}`

export const getEditorSuggestionOptionIdForIndex = <T,>(
  menuId: string,
  items: readonly T[],
  index: number,
  getId: (item: T) => string,
) => {
  const item = items[index]
  if (!item) return null
  const itemId = getId(item)
  let occurrence = 0
  for (let itemIndex = 0; itemIndex < index; itemIndex += 1) {
    const precedingItem = items[itemIndex]
    if (precedingItem && getId(precedingItem) === itemId) occurrence += 1
  }
  return getEditorSuggestionOptionId(menuId, itemId, occurrence)
}

export const EditorSuggestionMenu = <T,>({
  activeIndex,
  className,
  emptyLabel,
  getGroup,
  getId,
  getLabel,
  groups,
  items,
  label,
  menuId,
  onActiveIndexChange,
  onSelect,
  renderLeading,
  renderMeta,
  renderScreenReaderDescription,
  selectionHint,
}: EditorSuggestionMenuProps<T>) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const generatedId = useId()
  const resolvedMenuId = menuId ?? `editor-suggestions-${generatedId}`
  const occurrences = new Map<string, number>()
  const entries = items.map((item, index) => {
    const itemId = getId(item)
    const occurrence = occurrences.get(itemId) ?? 0
    occurrences.set(itemId, occurrence + 1)
    return {
      index,
      item,
      optionId: getEditorSuggestionOptionId(resolvedMenuId, itemId, occurrence),
    }
  })
  const selectedValue = entries[activeIndex]?.optionId ?? ''
  const grouping = getGroup && groups ? { getGroup, groups } : null
  const sections = grouping?.groups ?? [{ id: UNGROUPED_ID, label: '' }]

  useEffect(() => {
    rootRef.current
      ?.querySelector<HTMLElement>('[data-editor-suggestion-selected]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedValue])

  return (
    <Command
      className={cn(menuSurfaceStyles(), 'overflow-hidden p-0', className)}
      contentEditable={false}
      data-editor-suggestion-menu=""
      id={resolvedMenuId}
      onValueChange={(value) => {
        const entry = entries.find(({ optionId }) => optionId === value)
        if (entry && entry.index !== activeIndex) onActiveIndexChange(entry.index)
      }}
      ref={rootRef}
      shouldFilter={false}
      value={selectedValue}
    >
      <CommandList
        className="max-h-72 scroll-py-1 p-1 motion-reduce:scroll-auto"
        label={label}
        role="listbox"
      >
        {items.length === 0 ? <CommandEmpty>{emptyLabel}</CommandEmpty> : null}
        {sections.map((section) => {
          const sectionItems = entries.filter(
            ({ item }) =>
              !grouping || section.id === UNGROUPED_ID || grouping.getGroup(item) === section.id,
          )
          if (sectionItems.length === 0) return null
          return (
            <CommandGroup heading={section.label || undefined} key={section.id}>
              {sectionItems.map(({ index: itemIndex, item, optionId }) => {
                const selected = itemIndex === activeIndex
                const meta = renderMeta?.(item)
                const screenReaderDescription = renderScreenReaderDescription?.(item)
                const descriptionId = `${optionId}-description`
                const labelId = `${optionId}-label`
                return (
                  <CommandItem
                    aria-describedby={screenReaderDescription ? descriptionId : undefined}
                    aria-labelledby={labelId}
                    aria-selected={selected}
                    className={cn(
                      menuItemStyles(),
                      'group flex w-full items-center text-left outline-none',
                    )}
                    data-active={selected ? 'true' : undefined}
                    data-editor-suggestion-selected={selected ? '' : undefined}
                    id={optionId}
                    key={optionId}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => onActiveIndexChange(itemIndex)}
                    onSelect={() => onSelect(item)}
                    ref={(node) => {
                      // cmdk 1.1.1 overwrites Item's id after spreading props.
                      if (node) node.id = optionId
                    }}
                    role="option"
                    value={optionId}
                  >
                    {renderLeading?.(item)}
                    <span className="min-w-0 flex-1 truncate" id={labelId}>
                      {getLabel(item)}
                    </span>
                    {meta ? (
                      <span className="max-w-32 truncate text-[11px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                        {meta}
                      </span>
                    ) : null}
                    {selectionHint ? (
                      <span
                        aria-hidden="true"
                        className="font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity duration-150 group-data-[active=true]:opacity-100 motion-reduce:transition-none"
                      >
                        {selectionHint}
                      </span>
                    ) : null}
                    {screenReaderDescription ? (
                      <span className="sr-only" id={descriptionId}>
                        {screenReaderDescription}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
      </CommandList>
    </Command>
  )
}
