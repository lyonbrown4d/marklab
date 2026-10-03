import type { TText } from 'platejs'
import type { HTMLAttributes, ReactNode } from 'react'

type CompletionLeaf = TText & {
  plateInlineCompletion?: string
  plateInlineCompletionSource?: 'ai' | 'document'
}

type PlateInlineCompletionLeafProps = {
  attributes: HTMLAttributes<HTMLSpanElement>
  children: ReactNode
  leaf: TText
}

export const PlateInlineCompletionLeaf = ({
  attributes,
  children,
  leaf,
}: PlateInlineCompletionLeafProps) => {
  const completionLeaf = leaf as CompletionLeaf
  return (
    <span {...attributes}>
      {children}
      {completionLeaf.plateInlineCompletion ? (
        <span
          aria-hidden="true"
          className="marklab-ai-ghost-text"
          contentEditable={false}
          data-source={completionLeaf.plateInlineCompletionSource}
        >
          {completionLeaf.plateInlineCompletion}
        </span>
      ) : null}
    </span>
  )
}
