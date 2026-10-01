import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { detectPlatform } from '@tanstack/react-hotkeys'
import {
  Bold,
  ClipboardPaste,
  Code2,
  Copy,
  Italic,
  Link,
  Redo2,
  Scissors,
  Strikethrough,
  TextSelect,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuShortcutStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'
import { useI18n } from '@/i18n/useI18n'
import { formatShortcut, resolveShortcutBindings, type ShortcutBindings } from '@/logic/shortcuts'

export type EditorContextMenuAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'link'

export type EditorContextMenuCapabilities = Partial<Record<EditorContextMenuAction, boolean>>

export type EditorContextMenuAdapter = {
  getCapabilities: () => EditorContextMenuCapabilities
  onAction: (action: EditorContextMenuAction) => void
}

type EditorContextMenuProps = EditorContextMenuAdapter & {
  children: ReactElement
  shortcutOverrides?: ShortcutBindings
}

type MenuEntry = {
  action: EditorContextMenuAction
  icon: LucideIcon
  labelKey: string
  shortcut: string
}

const editEntries: readonly MenuEntry[] = [
  { action: 'undo', icon: Undo2, labelKey: 'edit.undo', shortcut: 'Mod+Z' },
  { action: 'redo', icon: Redo2, labelKey: 'edit.redo', shortcut: '' },
]

const clipboardEntries: readonly MenuEntry[] = [
  { action: 'cut', icon: Scissors, labelKey: 'edit.cut', shortcut: 'Mod+X' },
  { action: 'copy', icon: Copy, labelKey: 'edit.copy', shortcut: 'Mod+C' },
  { action: 'paste', icon: ClipboardPaste, labelKey: 'edit.paste', shortcut: 'Mod+V' },
  { action: 'selectAll', icon: TextSelect, labelKey: 'edit.selectAll', shortcut: 'Mod+A' },
]

const formatEntries: ReadonlyArray<
  Omit<MenuEntry, 'shortcut'> & { shortcutAction: keyof ShortcutBindings }
> = [
  { action: 'bold', icon: Bold, labelKey: 'shortcuts.bold', shortcutAction: 'editor.bold' },
  { action: 'italic', icon: Italic, labelKey: 'shortcuts.italic', shortcutAction: 'editor.italic' },
  {
    action: 'strike',
    icon: Strikethrough,
    labelKey: 'shortcuts.strike',
    shortcutAction: 'editor.strike',
  },
  {
    action: 'inlineCode',
    icon: Code2,
    labelKey: 'shortcuts.inlineCode',
    shortcutAction: 'editor.inlineCode',
  },
  { action: 'link', icon: Link, labelKey: 'shortcuts.link', shortcutAction: 'editor.link' },
]

export const EditorContextMenu = ({
  children,
  getCapabilities,
  onAction,
  shortcutOverrides = {},
}: EditorContextMenuProps) => {
  const { t } = useI18n()
  const [capabilities, setCapabilities] = useState<EditorContextMenuCapabilities>({})
  const shortcuts = resolveShortcutBindings(shortcutOverrides)
  const renderEntry = (entry: MenuEntry) => {
    const Icon = entry.icon
    const shortcut =
      entry.action === 'redo'
        ? detectPlatform() === 'mac'
          ? 'Meta+Shift+Z'
          : 'Control+Y'
        : entry.shortcut
    return (
      <ContextMenuItem
        disabled={capabilities[entry.action] === false}
        key={entry.action}
        className={menuItemStyles()}
        onSelect={() => onAction(entry.action)}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{t(entry.labelKey)}</span>
        <ContextMenuShortcut className={menuShortcutStyles}>
          {formatShortcut(shortcut)}
        </ContextMenuShortcut>
      </ContextMenuItem>
    )
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) setCapabilities(getCapabilities())
      }}
    >
      <ContextMenuTrigger asChild onKeyDown={openContextMenuFromKeyboard}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={t('menu.edit')}
        className={menuSurfaceStyles({ className: 'w-56' })}
        collisionPadding={8}
      >
        {editEntries.map(renderEntry)}
        <ContextMenuSeparator className={menuSeparatorStyles} />
        {clipboardEntries.map(renderEntry)}
        <ContextMenuSeparator className={menuSeparatorStyles} />
        {formatEntries
          .filter((entry) => entry.action !== 'link' || capabilities.link !== false)
          .map((entry) =>
            renderEntry({
              ...entry,
              shortcut: shortcuts[entry.shortcutAction][0] ?? '',
            }),
          )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

const openContextMenuFromKeyboard = (event: KeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  event.preventDefault()
  const bounds = event.currentTarget.getBoundingClientRect()
  event.currentTarget.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + Math.min(24, bounds.width / 2),
      clientY: bounds.top + Math.min(24, bounds.height / 2),
    }),
  )
}
