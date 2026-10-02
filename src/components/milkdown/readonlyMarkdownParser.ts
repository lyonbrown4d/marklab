import { Editor, defaultValueCtx, parserCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { remarkImageTitleCompatibility } from '@/components/milkdown/markdownImageTitleCompatibility'

let parserEditor: Promise<Editor> | null = null

const createParserEditor = () => {
  const root = document.createElement('div')

  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, '')
    })
    .use(commonmark)
    .use(gfm)
    .use(remarkImageTitleCompatibility)
    .create()
}

const getParserEditor = () => {
  parserEditor ??= createParserEditor().catch((error: unknown) => {
    parserEditor = null
    throw error
  })
  return parserEditor
}

/**
 * Reuses one detached Milkdown runtime so virtual rows share the same Markdown
 * parser and schema as the editable surface without mounting Crepe per row.
 */
export const parseReadonlyMarkdown = async (markdown: string): Promise<ProseMirrorNode> => {
  const editor = await getParserEditor()
  return editor.action((ctx) => ctx.get(parserCtx)(markdown))
}
