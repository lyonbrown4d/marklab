import type { Crepe } from '@milkdown/crepe'
import { commandsCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { insertImageCommand } from '@milkdown/kit/preset/commonmark'
import { Slice, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import clamp from 'lodash-es/clamp'
import { slugify } from '@/logic/paths'
import { callMilkdownCommand } from '@/components/milkdown/commandCompat'

export type PendingExternalValue = {
  path: string | null
  value: string
  baseValue: string
}

export type ReplaceMarkdownOptions = {
  preserveSelection?: boolean
}

export const readCrepeMarkdown = (crepe: Crepe | null, fallback: string) => {
  if (!crepe) return fallback
  try {
    return crepe.getMarkdown() ?? fallback
  } catch {
    return fallback
  }
}

export const focusCrepeEditor = (crepe: Crepe | null) => {
  if (!crepe) return
  crepe.editor.action((ctx) => {
    ctx.get(editorViewCtx).focus()
  })
}

export const focusCrepeEditorAtEnd = (crepe: Crepe | null) => {
  if (!crepe) return
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const tr = view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView()
    view.dispatch(tr)
    view.focus()
  })
}

export const replaceCrepeMarkdown = (
  crepe: Crepe,
  nextValue: string,
  applyingExternalValueRef: { current: boolean },
  latestValueRef: { current: string },
  options: ReplaceMarkdownOptions = {},
) => {
  crepe.editor.action((ctx) => {
    applyingExternalValueRef.current = true
    try {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const doc = parser(nextValue)
      if (!doc) return
      const state = view.state
      const selection = state.selection
      let tr = state.tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
      const nextPosition = options.preserveSelection === false ? 0 : selection.from
      const safeFrom = clamp(nextPosition, 0, Math.max(0, doc.content.size - 2))
      tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
      view.dispatch(tr)
      latestValueRef.current = nextValue
    } finally {
      applyingExternalValueRef.current = false
    }
  })
}

const findHeadingPosition = (doc: ProseMirrorNode, targetSlug: string) => {
  const usedSlugs = new Map<string, number>()
  let headingIndex = 0
  let foundPosition: number | null = null

  doc.descendants((node, pos) => {
    if (foundPosition !== null) return false
    if (node.type.name !== 'heading') return true

    const text = node.textContent.trim()
    const baseSlug = slugify(text) || `heading-${headingIndex + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    const slug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`
    headingIndex += 1

    if (slug === targetSlug) {
      foundPosition = pos
      return false
    }

    return true
  })

  return foundPosition
}

export const focusHeadingInCrepe = (crepe: Crepe, slug: string) => {
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const position = findHeadingPosition(view.state.doc, slug)
    if (position === null) return

    const selectionPosition = Math.min(position + 1, view.state.doc.content.size)
    const tr = view.state.tr
      .setSelection(Selection.near(view.state.doc.resolve(selectionPosition)))
      .scrollIntoView()
    view.dispatch(tr)
    view.focus()
  })
}

export const placeCrepeSelectionAtClientPoint = (
  crepe: Crepe | null,
  clientX: number,
  clientY: number,
) => {
  if (!crepe) return false
  let placed = false

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const result = view.posAtCoords({ left: clientX, top: clientY })
    if (!result) return

    const selection = Selection.near(view.state.doc.resolve(result.pos))
    view.dispatch(view.state.tr.setSelection(selection))
    view.focus()
    placed = true
  })

  return placed
}

export const insertImageIntoCrepe = (crepe: Crepe | null, src: string, alt = '') => {
  if (!crepe || !src) return false
  let inserted = false
  crepe.editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    inserted = callMilkdownCommand(commands, insertImageCommand, {
      src,
      alt,
      title: '',
    })
    if (inserted) {
      ctx.get(editorViewCtx).focus()
    }
  })
  return inserted
}

export const replaceImageSourceInCrepe = (
  crepe: Crepe | null,
  currentSrc: string,
  nextSrc: string,
) => {
  if (!crepe || !currentSrc || !nextSrc || currentSrc === nextSrc) return false
  let replaced = false

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    let tr = view.state.tr

    view.state.doc.descendants((node, position) => {
      if (node.type.name !== 'image' || node.attrs.src !== currentSrc) return true
      tr = tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        src: nextSrc,
      })
      replaced = true
      return true
    })

    if (replaced) {
      view.dispatch(tr)
    }
  })

  return replaced
}
