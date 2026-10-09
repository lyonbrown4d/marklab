import type { CompletionItem } from 'vscode-languageserver-types'
import { EditorSuggestionMenu } from '@/components/menu/EditorSuggestionMenu'

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
  const suggestions = items.slice(0, 8)
  return (
    <EditorSuggestionMenu
      activeIndex={activeIndex}
      className="absolute left-3 top-full z-50 mt-1 w-72"
      emptyLabel={label}
      getId={(suggestion) => suggestion.label}
      getLabel={(suggestion) => suggestion.label}
      items={suggestions}
      label={label}
      menuId={menuId}
      onActiveIndexChange={onActiveIndexChange}
      onSelect={onSelect}
      renderMeta={(suggestion) => suggestion.detail}
      renderScreenReaderDescription={itemDocumentation}
      selectionHint="Enter"
    />
  )
}
