import { memo, useCallback, useMemo } from 'react'
import MarkdownListView from '@/components/markdown/MarkdownListView'
import { useEditableDom } from '@/components/markdown/useEditableDom'
import { cn } from '@/lib/utils'

type ListElement = HTMLOListElement | HTMLUListElement

type MarkdownEditableListProps = {
  editable?: boolean
  items: string[]
  onCommit?: (value: string) => void
  ordered: boolean
}

export const readMarkdownListText = (element: HTMLElement) => {
  return Array.from(element.childNodes)
    .flatMap((node) => readListNodeText(node))
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
}

const readListNodeText = (node: ChildNode) => {
  if (node instanceof HTMLLIElement) {
    return [node.textContent ?? '']
  }

  return (node.textContent ?? '').split(/\r\n|\r|\n/)
}

const createListItem = (item: string) => {
  const listItem = document.createElement('li')
  listItem.className = 'text-xs leading-5 text-muted-foreground'
  listItem.textContent = item
  return listItem
}

const syncListItems = (element: ListElement, items: string[], value: string) => {
  if (readMarkdownListText(element) === value) return
  element.replaceChildren(...items.map(createListItem))
}

const MarkdownEditableList = ({
  editable = false,
  items,
  onCommit,
  ordered,
}: MarkdownEditableListProps) => {
  const value = useMemo(() => items.join('\n'), [items])
  const syncValue = useCallback(
    (element: ListElement) => syncListItems(element, items, value),
    [items, value],
  )
  const { editableProps, setElementRef } = useEditableDom<ListElement>({
    editable,
    value,
    onCommit,
    readValue: readMarkdownListText,
    syncValue,
  })

  const ListTag = ordered ? 'ol' : 'ul'

  return (
    <MarkdownListView ordered={ordered}>
      <ListTag
        ref={setElementRef}
        className={cn(
          'm-0 flex flex-col gap-1 rounded-sm pl-5 outline-none focus:bg-transparent',
          ordered ? 'list-decimal' : 'list-disc',
        )}
        tabIndex={editable ? 0 : undefined}
        {...editableProps}
      />
    </MarkdownListView>
  )
}

export default memo(MarkdownEditableList)
