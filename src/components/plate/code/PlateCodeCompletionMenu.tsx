import type { CompletionItem } from 'vscode-languageserver-types'
import { menuItemStyles, menuSurfaceStyles } from '@/components/overlay/overlayStyles'
import { cn } from '@/lib/utils'

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
      className={cn(menuSurfaceStyles(), 'absolute left-3 top-full z-50 mt-1 w-72 overflow-hidden')}
      contentEditable={false}
      id={menuId}
      role="listbox"
    >
      {items.slice(0, 8).map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          id={`${menuId}-option-${index}`}
          aria-selected={index === activeIndex}
          className={cn(menuItemStyles(), 'group flex w-full items-center text-left outline-none')}
          data-active={index === activeIndex ? 'true' : undefined}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(item)}
        >
          <span className="min-w-0 flex-1 truncate font-mono">{item.label}</span>
          {item.detail ? (
            <span className="max-w-28 truncate text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
              {item.detail}
            </span>
          ) : null}
          {itemDocumentation(item) ? (
            <span className="sr-only">{itemDocumentation(item)}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
