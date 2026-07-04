import { Crepe } from '@milkdown/crepe'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import { mermaidCodeBlockConfig } from '@/components/milkdown/mermaidPreview'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

export type MarkdownCrepeInstance = Crepe

type CreateMarkdownCrepeOptions = {
  root: HTMLElement
  initialValue: string
  darkMode: boolean
  onSlashImageImport: () => Promise<boolean>
  onSlashCalendarFileCreate: () => Promise<string | null>
  placeholder: string
  slashLabels: SlashCommandLabels
}

export const createMarkdownCrepe = ({ root, initialValue, darkMode }: CreateMarkdownCrepeOptions) =>
  new Crepe({
    root,
    defaultValue: initialValue,
    featureConfigs: {
      [Crepe.Feature.CodeMirror]: {
        theme: darkMode ? undefined : eclipse,
        ...mermaidCodeBlockConfig,
      },
      [Crepe.Feature.LinkTooltip]: {
        onCopyLink: () => {},
      },
    },
  })
