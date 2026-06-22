import { Check } from 'lucide-react'
import { CommandShortcut } from '@/components/ui/command'
import {
  formatShortcutList,
  resolveShortcutBindings,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'

export const commandActionShortcutIds = {
  commandPalette: 'app.commandPalette',
  settings: 'app.settings',
  newFile: 'file.new',
  openProject: 'file.openProject',
  openFile: 'file.openFile',
  closeTab: 'tab.close',
  viewWysiwyg: 'view.wysiwyg',
  viewSource: 'view.source',
  viewGraph: 'view.graph',
  toggleSidebar: 'view.toggleSidebar',
  toggleRightSidebar: 'view.toggleRightSidebar',
} as const satisfies Record<string, ShortcutActionId>

const shortcutActionIds = Object.values(commandActionShortcutIds)

export const currentCommandItemClassName = 'bg-accent text-accent-foreground'

export const createShortcutLabels = (shortcutOverrides: ShortcutBindings) => {
  const bindings = resolveShortcutBindings(shortcutOverrides)
  return shortcutActionIds.reduce(
    (labels, actionId) => {
      const actionBindings = bindings[actionId]
      if (actionBindings.length > 0) labels[actionId] = formatShortcutList(actionBindings)
      return labels
    },
    {} as Partial<Record<ShortcutActionId, string>>,
  )
}

export const CommandActionShortcut = ({ label }: { label?: string }) => {
  if (!label) return null
  return <CommandShortcut>{label}</CommandShortcut>
}

export const CurrentItemCheck = () => {
  return <Check aria-hidden="true" className="ml-auto text-primary" />
}
