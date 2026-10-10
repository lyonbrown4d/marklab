import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  TextQuote,
  Trash2,
  Scissors,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'
import type {
  BlockActionAvailability,
  BlockMenuAction,
} from '@/components/plate/nodes/blockActions'
import { useI18n } from '@/i18n/useI18n'

type BlockActionMenuProps = BlockActionAvailability & {
  onAction: (action: BlockMenuAction) => void
}

type ActionItemProps = {
  children: ReactNode
  disabled?: boolean
  icon: typeof Pilcrow
  onSelect: () => void
  tone?: 'default' | 'destructive'
}

const ActionItem = ({ children, disabled, icon: Icon, onSelect, tone }: ActionItemProps) => (
  <DropdownMenuItem className={menuItemStyles({ tone })} disabled={disabled} onSelect={onSelect}>
    <Icon aria-hidden="true" />
    <span>{children}</span>
  </DropdownMenuItem>
)

export const BlockActionMenu = ({
  canMoveDown,
  canMoveUp,
  canSetType,
  onAction,
}: BlockActionMenuProps) => {
  const { t } = useI18n()
  return (
    <DropdownMenuContent
      align="start"
      className={menuSurfaceStyles({ className: 'w-52' })}
      side="right"
      sideOffset={6}
    >
      <ActionItem
        disabled={!canSetType}
        icon={Pilcrow}
        onSelect={() => onAction({ kind: 'setType', type: 'p' })}
      >
        {t('shortcuts.paragraph')}
      </ActionItem>
      <ActionItem
        disabled={!canSetType}
        icon={Heading1}
        onSelect={() => onAction({ kind: 'setType', type: 'h1' })}
      >
        {t('shortcuts.heading1')}
      </ActionItem>
      <ActionItem
        disabled={!canSetType}
        icon={Heading2}
        onSelect={() => onAction({ kind: 'setType', type: 'h2' })}
      >
        {t('shortcuts.heading2')}
      </ActionItem>
      <ActionItem
        disabled={!canSetType}
        icon={Heading3}
        onSelect={() => onAction({ kind: 'setType', type: 'h3' })}
      >
        {t('shortcuts.heading3')}
      </ActionItem>
      <ActionItem
        disabled={!canSetType}
        icon={TextQuote}
        onSelect={() => onAction({ kind: 'setType', type: 'blockquote' })}
      >
        {t('shortcuts.quote')}
      </ActionItem>
      <DropdownMenuSeparator className={menuSeparatorStyles} />
      <ActionItem icon={ClipboardCopy} onSelect={() => onAction({ kind: 'copy' })}>
        {t('edit.copy')}
      </ActionItem>
      <ActionItem icon={ClipboardCopy} onSelect={() => onAction({ kind: 'copyAsMarkdown' })}>
        {t('edit.copyAsMarkdown')}
      </ActionItem>
      <ActionItem icon={Scissors} onSelect={() => onAction({ kind: 'cut' })}>
        {t('edit.cut')}
      </ActionItem>
      <ActionItem icon={Copy} onSelect={() => onAction({ kind: 'duplicate' })}>
        {t('plate.blockActions.duplicate')}
      </ActionItem>
      <ActionItem
        disabled={!canMoveUp}
        icon={ArrowUp}
        onSelect={() => onAction({ kind: 'moveUp' })}
      >
        {t('plate.blockActions.moveUp')}
      </ActionItem>
      <ActionItem
        disabled={!canMoveDown}
        icon={ArrowDown}
        onSelect={() => onAction({ kind: 'moveDown' })}
      >
        {t('plate.blockActions.moveDown')}
      </ActionItem>
      <DropdownMenuSeparator className={menuSeparatorStyles} />
      <ActionItem icon={Trash2} onSelect={() => onAction({ kind: 'delete' })} tone="destructive">
        {t('context.delete')}
      </ActionItem>
    </DropdownMenuContent>
  )
}
