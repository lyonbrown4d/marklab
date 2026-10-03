import { useTodoListElement, useTodoListElementState } from '@platejs/list-classic/react'
import { Children } from 'react'
import type { TElement } from 'platejs'
import { type PlateElementProps, useReadOnly } from 'platejs/react'
import {
  BaseListItemElement,
  NumberedListElement as BaseNumberedListElement,
  TaskListElement as BaseTaskListElement,
} from '@/components/ui/list-classic-node'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(nodeText).join('')
}

const taskLabel = (element: TElement) => {
  const text = nodeText(element).trim()
  if (!text) return 'Task'
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} task`
}

const AccessibleTaskListItem = (props: PlateElementProps) => {
  const readOnly = useReadOnly()
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const [firstChild, ...otherChildren] = Children.toArray(props.children)

  return (
    <BaseListItemElement {...props}>
      <div
        className={cn(
          'flex items-stretch *:nth-[2]:flex-1 *:nth-[2]:focus:outline-none',
          state.checked && '*:nth-[2]:text-muted-foreground *:nth-[2]:line-through',
        )}
      >
        <div
          className="-ms-5 me-1.5 flex w-fit select-none items-start justify-center pt-[0.275em]"
          contentEditable={false}
        >
          <Checkbox {...checkboxProps} aria-label={taskLabel(props.element)} disabled={readOnly} />
        </div>
        {firstChild}
      </div>
      {otherChildren}
    </BaseListItemElement>
  )
}

export const ListItemElement = (props: PlateElementProps) => {
  if (typeof props.element.checked === 'boolean') return <AccessibleTaskListItem {...props} />
  return <BaseListItemElement {...props} />
}

export const NumberedListElement = (props: PlateElementProps) => {
  const start = typeof props.element.start === 'number' ? props.element.start : undefined
  const attributes = start === undefined ? props.attributes : { ...props.attributes, start }

  return <BaseNumberedListElement {...props} attributes={attributes} />
}

export const TaskListElement = (props: PlateElementProps) => {
  if (props.element.ordered !== true) return <BaseTaskListElement {...props} />

  const start = typeof props.element.start === 'number' ? props.element.start : undefined
  const attributes = start === undefined ? props.attributes : { ...props.attributes, start }

  return <BaseNumberedListElement {...props} attributes={attributes} />
}
