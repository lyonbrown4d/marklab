import { commandsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import {
  markdownEditorSlashCommands,
  type SlashCommandGroupId,
} from '@/components/milkdown/editorCommandCatalog'

const imageIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M19 5v14H5V5h14Zm0-2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14Z" />
  </svg>
`

export type SlashCommandLabels = {
  textGroup: string
  listGroup: string
  advancedGroup: string
  text: string
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  quote: string
  divider: string
  bulletList: string
  orderedList: string
  taskList: string
  image: string
  codeBlock: string
  table: string
}

export const createSlashMenuConfig = (
  labels: SlashCommandLabels,
  onImageImport: () => Promise<boolean>,
) => ({
  textGroup: {
    label: labels.textGroup,
    ...createNativeSlashItems(labels, 'text'),
  },
  listGroup: {
    label: labels.listGroup,
    ...createNativeSlashItems(labels, 'list'),
  },
  advancedGroup: {
    label: labels.advancedGroup,
    image: null,
    ...createNativeSlashItems(labels, 'advanced'),
    math: null,
  },
  buildMenu: (builder: {
    getGroup: (key: string) => {
      addItem: (
        key: string,
        item: {
          label: string
          icon: string
          onRun: (ctx: Ctx) => void
        },
      ) => unknown
    }
  }) => {
    builder.getGroup('advanced').addItem('image-import', {
      label: labels.image,
      icon: imageIcon,
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
        void onImageImport()
      },
    })
  },
})

const createNativeSlashItems = (labels: SlashCommandLabels, group: SlashCommandGroupId) => {
  return Object.fromEntries(
    markdownEditorSlashCommands
      .filter((command) => command.group === group && command.mode === 'native')
      .map((command) => [command.key, { label: labels[command.labelKey] }]),
  )
}
