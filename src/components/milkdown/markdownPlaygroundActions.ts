import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { Slice } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'

export const relocateFixedDropIndicatorToViewportRoot = (root: HTMLElement) => {
  const indicators = root.querySelectorAll<HTMLElement>('.milkdown-drop-indicator')
  indicators.forEach((indicator) => {
    indicator.dataset.marklabPlaygroundOverlay = 'drop-cursor'
    document.body.appendChild(indicator)
  })
}

export const replaceMarkdownLikePlayground = (crepe: Crepe, markdown: string) => {
  if (crepe.getMarkdown() === markdown) return

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const parser = ctx.get(parserCtx)
    const doc = parser(markdown)
    if (!doc) return

    const state = view.state
    const { from } = state.selection
    let tr = state.tr
    tr = tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))

    const docSize = doc.content.size
    const safeFrom = Math.max(0, Math.min(from, Math.max(0, docSize - 2)))
    tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
    view.dispatch(tr)
  })
}

export const readPlaygroundMarkdown = (crepe: Crepe, fallback: string): string => {
  try {
    return crepe.getMarkdown() ?? fallback
  } catch {
    return fallback
  }
}
