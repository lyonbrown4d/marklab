import type { CompletionItem } from 'vscode-languageserver-types'

type PlateCodeCompletionMenuProps = {
  activeIndex: number
  items: CompletionItem[]
  label: string
  menuId: string
  onActiveIndexChange: (index: number) => void
  onSelect: (item: CompletionItem) => void
}

const itemDocumentation = (item: CompletionItem) =>
  typeof item.documentation === 'string' ? item.documentation : item.documentation?.value

export const PlateCodeCompletionMenu = ({
  activeIndex,
  items,
  label,
  menuId,
  onActiveIndexChange,
  onSelect,
}: PlateCodeCompletionMenuProps) => {
  if (items.length === 0) return null
  return (
    <div
      aria-label={label}
      className="absolute left-3 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      contentEditable={false}
      id={menuId}
      role="listbox"
    >
      {items.slice(0, 8).map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          id={`${menuId}-option-${index}`}
          aria-selected={index === activeIndex}
          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(item)}
        >
          <span className="min-w-0 flex-1 truncate font-mono">{item.label}</span>
          {item.detail ? (
            <span className="max-w-28 truncate text-xs text-muted-foreground">{item.detail}</span>
          ) : null}
          {itemDocumentation(item) ? (
            <span className="sr-only">{itemDocumentation(item)}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
