import { Crepe } from '@milkdown/crepe'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import {
  createSlashMenuConfig,
  type SlashCommandLabels,
} from '@/components/milkdown/slashMenuConfig'

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

export const createMarkdownCrepe = ({
  root,
  initialValue,
  darkMode,
  onSlashImageImport,
  onSlashCalendarFileCreate,
  placeholder,
  slashLabels,
}: CreateMarkdownCrepeOptions) =>
  new Crepe({
    root,
    defaultValue: initialValue,
    features: {
      [Crepe.Feature.BlockEdit]: true,
      [Crepe.Feature.Placeholder]: true,
    },
    featureConfigs: {
      [Crepe.Feature.CodeMirror]: {
        theme: darkMode ? undefined : eclipse,
      },
      [Crepe.Feature.LinkTooltip]: {
        onCopyLink: () => {},
      },
      [Crepe.Feature.Placeholder]: {
        text: placeholder,
        mode: 'block',
      },
      [Crepe.Feature.BlockEdit]: createSlashMenuConfig(
        slashLabels,
        onSlashImageImport,
        onSlashCalendarFileCreate,
      ),
    },
  })
