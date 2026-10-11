import {
  Bot,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  MoreHorizontal,
  Pilcrow,
  Quote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PlateSelectionToolbarLabels } from '@/components/plate/selection/PlateSelectionToolbar'
import type { PlateSelectionToolbarMoreAction } from '@/components/plate/selection/selectionToolbarMoreActions'

type MoreMenuProps = {
  labels: PlateSelectionToolbarLabels
  onAction: (action: PlateSelectionToolbarMoreAction) => boolean
}

const blockActions = [
  ['paragraph', 'paragraph', Pilcrow],
  ['heading1', 'heading1', Heading1],
  ['heading2', 'heading2', Heading2],
  ['heading3', 'heading3', Heading3],
  ['quote', 'quote', Quote],
] as const

export const PlateSelectionToolbarMoreMenu = ({ labels, onAction }: MoreMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button aria-label={labels.more} size="icon" type="button" variant="ghost">
        <MoreHorizontal aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="min-w-48"
      data-plate-selection-toolbar-menu="true"
      onCloseAutoFocus={(event) => event.preventDefault()}
      sideOffset={6}
    >
      <DropdownMenuLabel>{labels.blockStyle}</DropdownMenuLabel>
      {blockActions.map(([action, label, Icon]) => (
        <DropdownMenuItem key={action} onSelect={() => onAction(action)}>
          <Icon aria-hidden="true" />
          {labels[label]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onSelect={() => onAction('bulletList')}>
        <List aria-hidden="true" />
        {labels.bulletList}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onAction('orderedList')}>
        <ListOrdered aria-hidden="true" />
        {labels.orderedList}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onAction('copyMarkdown')}>
        <Copy aria-hidden="true" />
        {labels.copyMarkdown}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onAction('ai')}>
        <Bot aria-hidden="true" />
        {labels.ai}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
