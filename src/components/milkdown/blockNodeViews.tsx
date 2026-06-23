import {
  blockquoteSchema,
  bulletListSchema,
  hrSchema,
  orderedListSchema,
} from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { markdownBlockComponentRegistry } from '@/components/markdown/markdownComponentRegistry'

type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor

const {
  blockquote: BlockquoteView,
  divider: DividerView,
  list: ListView,
} = markdownBlockComponentRegistry

const createContentElement = (tagName: 'blockquote' | 'ol' | 'ul', className: string) => {
  const element = document.createElement(tagName)
  element.className = className
  return element
}

const MilkdownBlockquoteNodeView = () => {
  const { contentRef, selected } = useNodeViewContext()
  return <BlockquoteView contentRef={contentRef} selected={selected} />
}

const MilkdownBulletListNodeView = () => {
  const { contentRef, selected } = useNodeViewContext()
  return <ListView contentRef={contentRef} selected={selected} />
}

const MilkdownOrderedListNodeView = () => {
  const { contentRef, selected } = useNodeViewContext()
  return <ListView contentRef={contentRef} selected={selected} ordered />
}

const MilkdownDividerNodeView = () => {
  const { selected } = useNodeViewContext()
  return <DividerView selected={selected} />
}

export const createMarkdownBlockNodeViews = (nodeViewFactory: NodeViewFactory) => [
  $view(blockquoteSchema.node, () =>
    nodeViewFactory({
      component: MilkdownBlockquoteNodeView,
      as: 'div',
      contentAs: () =>
        createContentElement(
          'blockquote',
          'm-0 border-0 p-0 text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        ),
    }),
  ),
  $view(bulletListSchema.node, () =>
    nodeViewFactory({
      component: MilkdownBulletListNodeView,
      as: 'div',
      contentAs: () => createContentElement('ul', 'm-0 flex list-disc flex-col gap-1 pl-5'),
    }),
  ),
  $view(orderedListSchema.node, () =>
    nodeViewFactory({
      component: MilkdownOrderedListNodeView,
      as: 'div',
      contentAs: () => createContentElement('ol', 'm-0 flex list-decimal flex-col gap-1 pl-5'),
    }),
  ),
  $view(hrSchema.node, () =>
    nodeViewFactory({
      component: MilkdownDividerNodeView,
      as: 'div',
    }),
  ),
]
