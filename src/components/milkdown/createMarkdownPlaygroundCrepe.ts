import { Crepe } from '@milkdown/crepe'
import type { Extension } from '@codemirror/state'

import { mermaidCodeBlockConfig } from '@/components/milkdown/mermaidPreview'
import {
  createMarkdownPlaygroundSlashConfig,
  type SlashCommandLabels,
} from '@/components/milkdown/slashMenuConfig'
import type { SlashUrlInsertionRequest } from '@/components/milkdown/slashUrlInsertion'

type CreateMarkdownPlaygroundCrepeOptions = {
  codeBlockTheme: Extension
  defaultValue: string
  onCalendarFileCreate: () => Promise<string | null>
  onImageImport: () => Promise<boolean>
  onUrlInsert: (request: SlashUrlInsertionRequest) => void
  placeholder: string
  readOnly: boolean
  root: HTMLElement
  slashLabels: SlashCommandLabels
}

export const createMarkdownPlaygroundCrepe = ({
  codeBlockTheme,
  defaultValue,
  onCalendarFileCreate,
  onImageImport,
  onUrlInsert,
  placeholder,
  readOnly,
  root,
  slashLabels,
}: CreateMarkdownPlaygroundCrepeOptions): Crepe =>
  new Crepe({
    root,
    defaultValue,
    features: readOnly
      ? {
          [Crepe.Feature.BlockEdit]: false,
          [Crepe.Feature.Cursor]: false,
          [Crepe.Feature.Toolbar]: false,
        }
      : undefined,
    featureConfigs: {
      [Crepe.Feature.BlockEdit]: createMarkdownPlaygroundSlashConfig({
        labels: slashLabels,
        onCalendarFileCreate,
        onImageImport,
        onUrlInsert,
      }),
      [Crepe.Feature.CodeMirror]: {
        theme: codeBlockTheme,
        ...mermaidCodeBlockConfig,
      },
      [Crepe.Feature.LinkTooltip]: {
        onCopyLink: () => {},
      },
      [Crepe.Feature.Placeholder]: {
        mode: 'block',
        text: placeholder,
      },
    },
  })
